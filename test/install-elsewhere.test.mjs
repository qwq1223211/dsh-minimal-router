/**
 * "装在别处"集成测试。
 *
 * 【为什么单独一个文件】前面所有测试都是从**仓库目录**里 import 的。
 * 而真实用户装到的是 pnpm store 里的一个副本，那个副本：
 *   1. 只有 package.json `files` 列出的东西（别的一概没有）
 *   2. 在 node_modules/.pnpm/<hash>/ 下面，可能只读
 *   3. 升级时会被整个替换
 *
 * 本机 link 安装完全看不出这三个差异 —— 所以这里**照着 files 复制一份**，
 * 放进临时目录，当成"别人机器上的那份"来测。
 */
import { test, run, assert, assertEqual } from './harness.mjs'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, copyFileSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/** 把 package.json `files` 里声明的文件复制到目标目录（= npm pack 的效果） */
function packTo(target) {
  let count = 0
  for (const entry of pkg.files || []) {
    if (entry.includes('*')) {
      const [dir, pattern] = entry.split('/')
      const suffix = pattern.replace('*', '')
      const from = join(ROOT, dir)
      mkdirSync(join(target, dir), { recursive: true })
      for (const name of readdirSync(from)) {
        if (!name.endsWith(suffix)) continue
        copyFileSync(join(from, name), join(target, dir, name))
        count += 1
      }
    } else {
      const from = join(ROOT, entry)
      if (!statSync(from).isFile()) continue
      mkdirSync(dirname(join(target, entry)), { recursive: true })
      copyFileSync(from, join(target, entry))
      count += 1
    }
  }
  // package.json 本身永远是包的一部分（npm 会自动带上）
  copyFileSync(join(ROOT, 'package.json'), join(target, 'package.json'))
  return count
}

/** 递归列出目录里的文件（用于断言"没往包里写东西"） */
function listAll(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) listAll(full, out)
    else out.push(relative(dir, full).split('\\').join('/'))
  }
  return out
}

/** 极简假宿主：只提供插件真正用到的接口 */
function makeHost(model = 'deepseek-flash') {
  const tools = new Map()
  const listeners = new Map()
  const contexts = []
  return {
    tools,
    listeners,
    contexts,
    ctx: {
      effect(fn) {
        const d = fn()
        return typeof d === 'function' ? d : () => {}
      },
      on(event, listener) {
        const list = listeners.get(event) || []
        list.push(listener)
        listeners.set(event, list)
        return () => {}
      },
      get(name) {
        if (name === 'agentDefaultModel') return { provider: 'test', model }
        return undefined
      },
      systemPrompt: {
        context(definition) {
          contexts.push(definition)
          return () => {}
        },
      },
      tools: {
        register(definition) {
          tools.set(definition.name, definition)
        },
        schemas: () => [...tools.values()].map((t) => ({ name: t.name })),
      },
    },
  }
}

const workdir = mkdtempSync(join(tmpdir(), 'router-pack-'))
const packed = join(workdir, 'node_modules', '.pnpm', 'dsh-minimal-router@1.0.0', 'node_modules', 'dsh-minimal-router')

await test('打包：只复制 files 声明的文件，能装成一个"包"', () => {
  const count = packTo(packed)
  assert(count > 10, `复制到的文件太少：${count}`)
  assertEqual(readdirSync(packed).includes('lib'), true, 'lib 应该被带上')
})

await test('打包：从"安装目录"import 入口仍然成功', async () => {
  const mod = await import(pathToFileURL(join(packed, 'index.js')).href)
  assertEqual(typeof mod.apply, 'function')
  assertEqual(Array.isArray(mod.inject), true)
  assertEqual(mod.inject.join(','), 'tools', 'inject 只能硬依赖 tools')
})

await test('打包：运行时数据路径仍然指向用户目录，不是安装目录', async () => {
  const mod = await import(pathToFileURL(join(packed, 'index.js')).href)
  assertEqual(mod.STATE_DIR.startsWith(homedir()), true, `STATE_DIR 应在用户目录：${mod.STATE_DIR}`)
  assertEqual(mod.STATE_DIR.startsWith(packed), false, 'STATE_DIR 不能落在安装目录里')
  const probe = mod.pickProbeDataFile({})
  assertEqual(probe.startsWith(packed), false, '探针数据不能落在安装目录里')
})

await test('打包：内置示例跟着包一起走（files 漏了 examples 就会挂）', async () => {
  const mod = await import(pathToFileURL(join(packed, 'index.js')).href)
  const presets = mod.listPresets()
  assert(presets.length >= 4, `示例数量不对：${JSON.stringify(presets)}`)
  assert(presets.includes('python-data'), 'python-data 应该存在')
})

await test('打包：从安装目录跑 apply，全套工具都能注册上', async () => {
  const mod = await import(pathToFileURL(join(packed, 'index.js')).href)
  const host = makeHost()
  mod.apply(host.ctx, {})

  for (const name of ['route_stage', 'route_status', 'route_reset', 'route_init', 'route_use', 'route_hint']) {
    assert(host.tools.has(name), `路由工具 ${name} 没注册`)
  }
  assert(host.tools.has('guard_status'), '熔断工具没注册')
  assert(host.tools.has('cache_probe_report'), '探针工具没注册')
  assert(host.contexts.length > 0, '尾部提示没注册')
})

await test('打包：apply 之后安装目录里不该多出任何文件', () => {
  const before = listAll(packed).sort().join('|')
  // 再跑一遍 apply（模拟第二次加载），确认它不往包里写东西
  return import(pathToFileURL(join(packed, 'index.js')).href).then((mod) => {
    const host = makeHost()
    mod.apply(host.ctx, {})
    const after = listAll(packed).sort().join('|')
    assertEqual(after, before, 'apply 往安装目录里写文件了（pnpm store 里可能只读会直接崩）')
  })
})

await test('打包：没有 systemPrompt 服务时也能加载（只是不注提示）', async () => {
  const mod = await import(pathToFileURL(join(packed, 'index.js')).href)
  const host = makeHost()
  delete host.ctx.systemPrompt
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    mod.apply(host.ctx, {})
    assert(host.tools.has('route_status'), '缺 systemPrompt 时路由工具仍应在')
    assert(host.tools.has('guard_reset'), '缺 systemPrompt 不该连累熔断')
    assertEqual(host.contexts.length, 0, '没服务就不该注册尾插')
    assert(warnings.some((w) => w.includes('systemPrompt')), '要给一句解释')
  } finally {
    console.warn = original
  }
})

await test('打包：清理临时目录', () => {
  rmSync(workdir, { recursive: true, force: true })
})

run()
