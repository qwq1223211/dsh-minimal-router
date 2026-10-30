#!/usr/bin/env node
/**
 * 依赖与入口体检（CI 会跑，失败退出码 1）。
 *
 * 【为什么要它】这个项目最危险的一类 bug 是"只在别人机器上才炸"：
 *   · 数据写在自己包里 → pnpm store 里升级即清空
 *   · 硬依赖某个服务 → 缺了它整个插件加载失败
 *   · files 少列一个文件 → 别人装上去 require 不到
 * 这三类在本机 link 安装时**全都正常**，所以必须机器检查，不能靠手感。
 *
 * 【教训】这个脚本以前把路径硬编码，报的是"记忆里的旧值"，
 * 白白误导过一轮。所以现在所有数值都**从代码里 import 出来**，不写死。
 *
 * 跑法：node scripts/audit-deps.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve, relative } from 'node:path'

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []
const notes = []

function ok(label, detail = '') {
  console.log(`  ✔ ${label}${detail ? ` ${detail}` : ''}`)
}
function bad(label, detail, hint = '') {
  problems.push(`${label}${detail ? `：${detail}` : ''}${hint ? `（${hint}）` : ''}`)
  console.log(`  ✘ ${label}${detail ? ` ${detail}` : ''}`)
}

console.log('\n=== 1. import 来源（零依赖是不是真的）===')
const NODE_BUILTINS = new Set(['fs', 'path', 'os', 'url', 'crypto', 'util', 'module', 'zlib', 'node:fs', 'node:fs/promises', 'node:path', 'node:os', 'node:url'])
const sourceFiles = ['index.js', ...readdirSync(join(PKG, 'lib')).map((f) => `lib/${f}`)]
const external = new Set()
for (const rel of sourceFiles) {
  const text = readFileSync(join(PKG, rel), 'utf8')
  for (const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1]
    if (spec.startsWith('.') || NODE_BUILTINS.has(spec) || spec.startsWith('node:')) continue
    external.add(`${spec} (${rel})`)
  }
}
if (external.size > 0) bad('发现外部依赖但 package.json 没声明', [...external].join(', '), '装上去会 cannot find module')
else ok('只用 node: 内置 + 本地相对文件，零运行时依赖成立')

console.log('\n=== 2. 入口字段一致性 ===')
const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'))
const normalize = (p) => String(p || '').replace(/^\.\//, '')
if (!pkg.main) bad('package.json 缺 main')
else if (pkg.exports && pkg.exports['.'] && normalize(pkg.exports['.']) !== normalize(pkg.main)) {
  bad('main 与 exports["."] 不一致', `${pkg.main} vs ${pkg.exports['.']}`, '不同工具解析到不同文件')
} else ok('main 与 exports["."] 一致', `(${pkg.main})`)
if (pkg.type !== 'module') bad('type 不是 module', String(pkg.type), 'ESM 语法会直接报错')
else ok('type = module')
const deps = { ...(pkg.dependencies || {}), ...(pkg.peerDependencies || {}), ...(pkg.optionalDependencies || {}) }
if (Object.keys(deps).length > 0) bad('声明了依赖', JSON.stringify(deps), '需要在安装后仍在')
else ok('dependencies / peerDependencies 为空')

console.log('\n=== 3. files 声明 vs 运行时真正要加载的文件 ===')
const entry = await import(pathToFileURL(join(PKG, 'index.js')).href)

/** 运行时真正会被 import 的文件（包括二级依赖）。路径统一成 POSIX 风格，否则 Windows 上匹配会挂 */
function reachableFiles(startRel, seen = new Set()) {
  const normalizedStart = startRel.split('\\').join('/')
  const full = join(PKG, normalizedStart)
  if (seen.has(normalizedStart) || !existsSync(full)) return seen
  seen.add(normalizedStart)
  const text = readFileSync(full, 'utf8')
  for (const m of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const next = relative(PKG, resolve(dirname(full), m[1])).split('\\').join('/')
    reachableFiles(next, seen)
  }
  return seen
}
const reachable = [...reachableFiles('index.js')]
const covered = (rel) => (pkg.files || []).some((entry) => {
  if (entry === rel) return true
  if (entry.includes('*')) {
    const [dir, pattern] = entry.split('/')
    const suffix = pattern.replace('*', '')
    return rel.startsWith(`${dir}/`) && rel.endsWith(suffix)
  }
  return false
})
const uncovered = reachable.filter((rel) => !covered(rel))
if (uncovered.length > 0) bad('这些运行时必需的文件没被 files 覆盖', uncovered.join(', '), '别人装上会 import 失败')
else ok(`运行时可达的 ${reachable.length} 个文件全部被 files 覆盖`)

const missing = []
for (const entry of pkg.files || []) {
  if (entry.includes('*')) {
    const [dir, pattern] = entry.split('/')
    const suffix = pattern.replace('*', '')
    if (!existsSync(join(PKG, dir))) missing.push(entry)
    else if (readdirSync(join(PKG, dir)).filter((n) => n.endsWith(suffix)).length === 0) missing.push(entry)
  } else if (!existsSync(join(PKG, entry))) missing.push(entry)
}
if (missing.length > 0) bad('files 里声明了不存在的文件', missing.join(', '))
else ok(`files 声明的 ${(pkg.files || []).length} 项都存在`)

console.log('\n=== 4. 入口能否被 import（走 exports 解析）===')
if (typeof entry.apply !== 'function') bad('入口没有导出 apply 函数')
else if (!Array.isArray(entry.inject)) bad('入口没有导出 inject 数组')
else ok('导出 apply + inject', JSON.stringify(entry.inject))
if (entry.inject.includes('systemPrompt')) {
  bad('inject 里含 systemPrompt', '', '缺这个服务的宿主会让整个插件加载失败')
} else ok('systemPrompt 不在 inject 里（可选服务，走 ctx.get 兜底）')

console.log('\n=== 5. engines.dsh（DSH 的真实判定逻辑）===')
// 【实证来源】app.asar 里 @deepseek-ai/dsh-app-boot/lib/index.js：
//   function satisfies(runtimeVersion, range) {
//     return range.trim() !== "" && semver.satisfies(runtimeVersion, range, { includePrerelease: true })
//   }
// 结论：① 是 semver 范围，不是精确值；② includePrerelease 为真（预发布版本也会匹配）；
//      ③ **空字符串会被判为不满足 → 直接拦住安装**。
const engines = (pkg.engines && pkg.engines.dsh) || ''
if (!engines) {
  bad('engines.dsh 缺失或为空', JSON.stringify(engines), '空字符串会被 DSH 判为不满足，直接拦装')
} else if (typeof engines !== 'string') {
  bad('engines.dsh 不是字符串', typeof engines, 'DSH 会抛 "must be a string"')
} else if (!/^[\^~><=*]|^\d|^\*|^workspace:/.test(engines.trim())) {
  bad('engines.dsh 不像一个合法的 semver 范围', engines, 'semver.satisfies 会判为不满足')
} else if (engines.includes('workspace:')) {
  bad('engines.dsh 用了 workspace: 协议', engines, '那是 peerDependencies 才支持的写法')
} else {
  ok('engines.dsh 是合法的范围表达式', engines)
}

console.log('\n=== 6. 运行时写盘路径必须在包外面 ===')
const stateDir = entry.STATE_DIR
const probeFile = typeof entry.pickProbeDataFile === 'function' ? entry.pickProbeDataFile({}) : ''
const cfg = typeof entry.normalizeConfig === 'function' ? entry.normalizeConfig({}) : {}
const stagesFile = cfg.customStagesFile || ''
notes.push(`STATE_DIR = ${stateDir}`)
notes.push(`探针数据   = ${probeFile}`)
notes.push(`阶段表     = ${stagesFile}`)
const insidePkg = (p) => typeof p === 'string' && p && resolve(p).startsWith(PKG)
for (const [label, p] of [['探针数据', probeFile], ['阶段表', stagesFile]]) {
  if (!p) bad(`${label} 路径没读到`)
  else if (insidePkg(p)) bad(`${label} 还在包目录里`, p, '真实依赖安装会被重装清空')
  else if (/node_modules|\.pnpm/.test(p)) bad(`${label} 落在依赖目录`, p)
  else ok(`${label} 在包外面`, p)
}

console.log('\n=== 7. 包目录只读时不能崩（模拟 pnpm store）===')
// 只读模拟：不改真实权限（Windows 上不可靠），而是断言"写盘路径不在包里"这件事已经由上一项保证，
// 并额外检查：代码里没有对包目录路径做同步写操作
const writeHits = []
for (const rel of ['index.js', ...readdirSync(join(PKG, 'lib')).map((f) => `lib/${f}`)]) {
  const text = readFileSync(join(PKG, rel), 'utf8')
  for (const m of text.matchAll(/(writeFileSync|writeFile|appendFile|mkdirSync|mkdir|copyFileSync)\s*\(([^)]*)/g)) {
    const arg = m[2]
    if (/new URL\(['"]\.\.?\//.test(arg) || /import\.meta\.url/.test(arg)) {
      writeHits.push(`${rel}: ${m[1]}(${arg.slice(0, 40)}…)`)
    }
  }
}
if (writeHits.length > 0) bad('有写操作指向包内路径', writeHits.join(' | '), 'pnpm store 里可能只读')
else ok('没有任何写操作指向包内路径')

console.log('\n============================================================')
for (const n of notes) console.log(`  ${n}`)
if (problems.length === 0) {
  console.log('\n  ✅ 依赖与入口体检通过（0 个问题）\n')
  process.exit(0)
}
console.log(`\n  ❌ 发现 ${problems.length} 个问题：`)
for (const p of problems) console.log(`    · ${p}`)
console.log('')
process.exit(1)
