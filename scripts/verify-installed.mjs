#!/usr/bin/env node
/**
 * 验证"真装进去的那一份"：文件齐不齐、能不能 import、会不会往包里写东西。
 *
 * 【为什么需要它】本机 link 安装 100% 正常，出问题的永远是"别人装的那一份"：
 *   · `files` 少列文件 → 装上去 import 失败
 *   · 数据写在包目录里 → pnpm store 升级即清空
 *   · 硬依赖某个服务 → 缺它整个插件加载失败
 * 所以装完值得跑一次，而不是"看它能起来应该就没问题"。
 *
 * 用法：
 *   node scripts/verify-installed.mjs            # 默认查 desktop profile
 *   node scripts/verify-installed.mjs verify-add  # 查指定 profile
 */
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const profile = (process.argv[2] || 'desktop').trim()
const profileDir = join(homedir(), '.dsh', 'profiles', profile)
const pnpmDir = join(profileDir, 'node_modules', '.pnpm')

if (!existsSync(profileDir)) {
  console.error(`✘ 找不到 profile：${profileDir}`)
  process.exit(1)
}

// 两种布局都要认：.pnpm 虚拟 store / 直接放 node_modules
const direct = join(profileDir, 'node_modules', '@local', 'dsh-minimal-router')
const candidates = []
if (existsSync(join(direct, 'package.json'))) candidates.push(direct)
if (existsSync(pnpmDir)) {
  for (const name of readdirSync(pnpmDir)) {
    if (!name.startsWith('@local+dsh-minimal-router@')) continue
    const p = join(pnpmDir, name, 'node_modules', '@local', 'dsh-minimal-router')
    if (existsSync(join(p, 'package.json'))) candidates.push(p)
  }
}
if (candidates.length === 0) {
  console.error(`✘ 这个 profile 里没装 dsh-minimal-router（${profileDir}）`)
  process.exit(1)
}

const pkgDir = candidates[0]
console.log(`profile      : ${profile}`)
console.log(`安装位置     : ${pkgDir}`)

const problems = []
const ok = (label, detail = '') => console.log(`  ✔ ${label}${detail ? ` ${detail}` : ''}`)
const bad = (label, detail = '') => {
  problems.push(`${label}${detail ? `：${detail}` : ''}`)
  console.log(`  ✘ ${label}${detail ? ` ${detail}` : ''}`)
}

// 1) 文件齐全
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(relative(pkgDir, full).split('\\').join('/'))
  }
  return out
}
const installed = walk(pkgDir)
const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
console.log(`\n版本         : ${pkgJson.version}`)
console.log(`装进去的文件 : ${installed.length} 个`)

// 2) 运行时真正需要的文件都在（用 files 声明反推不算数，直接看入口能否 import）
let mod
try {
  mod = await import(pathToFileURL(join(pkgDir, 'index.js')).href)
  ok('index.js 可以 import')
} catch (error) {
  bad('index.js import 失败', error && error.message)
}

if (mod) {
  // 3) 入口契约
  if (typeof mod.apply !== 'function') bad('没有导出 apply')
  else ok('导出 apply')
  if (!Array.isArray(mod.inject)) bad('没有导出 inject 数组')
  else if (mod.inject.includes('systemPrompt')) bad('inject 含 systemPrompt（缺这个服务的宿主会整插件加载失败）')
  else ok('inject', JSON.stringify(mod.inject))

  // 4) 写盘路径必须在包外
  const probeFile = typeof mod.pickProbeDataFile === 'function' ? mod.pickProbeDataFile({}) : ''
  const cfg = typeof mod.normalizeConfig === 'function' ? mod.normalizeConfig({}) : {}
  const stagesFile = cfg.customStagesFile || ''
  const inside = (p) => typeof p === 'string' && p && resolve(p).startsWith(resolve(pkgDir))
  if (!probeFile) bad('读不到探针数据路径')
  else if (inside(probeFile)) bad('探针数据写在包目录里', probeFile)
  else ok('探针数据在包外', probeFile)
  if (!stagesFile) bad('读不到阶段表路径')
  else if (inside(stagesFile)) bad('阶段表写在包目录里', stagesFile)
  else ok('阶段表在包外', stagesFile)

  // 5) 跑一次 apply：工具要注册上，且不许往包里写东西
  const before = installed.sort().join('|')
  const tools = new Map()
  const ctx = {
    effect(fn) {
      const d = fn()
      return typeof d === 'function' ? d : () => {}
    },
    on() {
      return () => {}
    },
    get(name) {
      return name === 'agentDefaultModel' ? { provider: 'probe', model: 'deepseek-flash' } : undefined
    },
    systemPrompt: { context: () => () => {} },
    tools: {
      register(d) {
        tools.set(d.name, d)
      },
      schemas: () => [],
      get: (n) => tools.get(n),
    },
  }
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...a) => warnings.push(a.join(' '))
  try {
    mod.apply(ctx, {})
  } catch (error) {
    bad('apply 抛异常', error && error.message)
  } finally {
    console.warn = originalWarn
  }
  const after = walk(pkgDir).sort().join('|')
  if (after !== before) bad('apply 往包目录里写了文件')
  else ok('apply 没有往包目录写文件')

  const expected = ['route_stage', 'route_status', 'route_reset', 'route_use', 'route_hint', 'route_init', 'guard_status', 'guard_reset', 'cache_probe_report', 'cache_probe_clear']
  const missing = expected.filter((n) => !tools.has(n))
  if (missing.length > 0) bad('缺少工具', missing.join(', '))
  else ok(`注册了 ${tools.size} 个工具`)

  if (warnings.length > 0) console.log(`\n  加载时警告：${warnings.map((w) => w.split('\n')[0]).join(' | ')}`)
}

console.log('')
if (problems.length === 0) {
  console.log('  ✅ 这份安装是好的\n')
  process.exit(0)
}
console.log(`  ❌ 发现 ${problems.length} 个问题：`)
for (const p of problems) console.log(`    · ${p}`)
console.log('')
process.exit(1)
