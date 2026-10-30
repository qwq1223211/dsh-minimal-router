/**
 * 端到端验证「旧版数据搬家」。
 *
 * 【为什么这个测试值钱】旧版把探针数据写在**包目录内部**（`<包>/data/usage.jsonl`），
 * 新版搬到 `~/.dsh/minimal-router/`，并且写了一次性搬家逻辑（`resolveProbeDataFile`）。
 * 这段逻辑此前只有单元测试，从没被"真实的旧布局"喂过。
 *
 * 【怎么做到不依赖第二台机器】
 *   `homedir()` 读的是环境变量（Windows: USERPROFILE，POSIX: HOME），
 *   所以在**子进程**里把 HOME/USERPROFILE 指到一个临时目录，
 *   `STATE_DIR` 就变成了 `临时目录/.dsh/minimal-router` —— 等于伪造了一台干净机器。
 *   再在那个临时目录里搭一份"旧版包装"，从里面 import，就能真跑一次搬家。
 */
import { test, run, assert, assertEqual } from './harness.mjs'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, copyFileSync, rmSync, statSync, openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/** 把当前包完整复制到目标目录（模拟"别人机器上的那份"） */
function copyPackageTo(target) {
  for (const entry of pkg.files || []) {
    if (entry.includes('*')) {
      const [dir, pattern] = entry.split('/')
      const suffix = pattern.replace('*', '')
      const from = join(ROOT, dir)
      if (!existsSync(from)) continue
      mkdirSync(join(target, dir), { recursive: true })
      for (const name of readdirSync(from)) {
        if (name.endsWith(suffix)) copyFileSync(join(from, name), join(target, dir, name))
      }
    } else if (existsSync(join(ROOT, entry)) && statSync(join(ROOT, entry)).isFile()) {
      mkdirSync(dirname(join(target, entry)), { recursive: true })
      copyFileSync(join(ROOT, entry), join(target, entry))
    }
  }
  copyFileSync(join(ROOT, 'package.json'), join(target, 'package.json'))
}

/** 造一份"旧版布局"的探针数据（写在包目录的 data/ 里） */
function writeLegacyData(pkgDir, count) {
  const dir = join(pkgDir, 'data')
  mkdirSync(dir, { recursive: true })
  const lines = []
  for (let i = 1; i <= count; i += 1) {
    lines.push(
      JSON.stringify({
        v: 1,
        at: 1_700_000_000_000 + i * 1000,
        iso: new Date(1_700_000_000_000 + i * 1000).toISOString(),
        provider: 'legacy',
        model: 'legacy-model',
        stage: 'auto',
        messages: i,
        tools: 100 + i,
        systemChars: 1000,
        toolsChars: 60_000,
        prefixSig: `sig${i % 3}`,
        inputTokens: 100,
        cacheReadTokens: 900,
        cacheWriteTokens: 0,
        promptTokens: 1000,
        outputTokens: 10,
        hitRate: 0.9,
      }),
    )
  }
  writeFileSync(join(dir, 'usage.jsonl'), `${lines.join('\n')}\n`, 'utf8')
}

/** 在子进程里跑指定脚本，用重定向过的 HOME。子进程输出写文件（pipe 在沙箱里可能 EPERM） */
function runWithFakeHome(fakeHome, scriptPath) {
  const outFile = join(fakeHome, 'result.json')
  const logFile = join(fakeHome, 'child.log')
  // 用真实的文件描述符当 stdio，既不用 pipe 又能拿到报错
  const logFd = openSync(logFile, 'w')
  let child
  try {
    child = spawnSync(process.execPath, [scriptPath, outFile], {
      cwd: fakeHome,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        NODE_V8_COVERAGE: '',
      },
    })
  } finally {
    closeSync(logFd)
  }
  const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''
  const result = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null
  return { status: child.status, result, log }
}

const workdir = mkdtempSync(join(tmpdir(), 'router-migrate-'))

await test('搬家：子进程能把 homedir 重定向到临时目录（测试前提成立）', () => {
  const fakeHome = join(workdir, 'probe-home')
  mkdirSync(fakeHome, { recursive: true })
  const script = join(fakeHome, 'check-home.mjs')
  const out = join(fakeHome, 'home.json')
  writeFileSync(
    script,
    `import { homedir } from 'node:os'\nimport { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(out)}, JSON.stringify({ home: homedir() }))\n`,
    'utf8',
  )
  const child = spawnSync(process.execPath, [script], {
    cwd: fakeHome,
    stdio: 'ignore',
    env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
  })
  assertEqual(child.status, 0)
  const home = JSON.parse(readFileSync(out, 'utf8')).home
  assertEqual(resolve(home), resolve(fakeHome), 'homedir 必须被重定向（否则这个测试没意义）')
})

await test('搬家：旧版装在包里 → 首次加载后数据出现在 ~/.dsh，且一条不少', () => {
  const LEGACY_COUNT = 7
  const fakeHome = join(workdir, 'home-legacy')
  const oldPkg = join(fakeHome, 'plugins', 'dsh-minimal-router')
  mkdirSync(oldPkg, { recursive: true })

  // 1) 搭一份"旧版机器上的布局"：包目录 + 包里的 data/usage.jsonl
  copyPackageTo(oldPkg)
  writeLegacyData(oldPkg, LEGACY_COUNT)
  assertEqual(existsSync(join(oldPkg, 'data', 'usage.jsonl')), true, '旧布局应该在包里')

  // 2) 在子进程里从"旧包"加载插件（homedir 指向 fakeHome）
  const script = join(fakeHome, 'load-old.mjs')
  const out = join(fakeHome, 'migrate.json')
  writeFileSync(
    script,
    `
import { existsSync, readFileSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import ${JSON.stringify(pathToFileURL(join(oldPkg, 'index.js')).href)}

const mod = await import(${JSON.stringify(pathToFileURL(join(oldPkg, 'index.js')).href)})

// 最小假宿主：只提供 apply 真正用到的接口
const tools = new Map()
const ctx = {
  effect(fn) { const d = fn(); return typeof d === 'function' ? d : () => {} },
  on() { return () => {} },
  get(name) { return name === 'agentDefaultModel' ? { provider: 'test', model: 'deepseek-flash' } : undefined },
  systemPrompt: { context() { return () => {} } },
  tools: { register(d) { tools.set(d.name, d) }, schemas: () => [], get: (n) => tools.get(n) },
}

const target = mod.pickProbeDataFile({})
mod.apply(ctx, {})

const exists = existsSync(target)
const text = exists ? readFileSync(target, 'utf8') : ''
const records = text.split('\\n').filter((line) => line.trim().length > 0)

const out = process.argv[2]
writeFileSync(out, JSON.stringify({
  stateDir: mod.STATE_DIR,
  target,
  exists,
  count: records.length,
  legacyStillThere: existsSync(${JSON.stringify(join(oldPkg, 'data', 'usage.jsonl'))}),
  tools: [...tools.keys()],
}))
`,
    'utf8',
  )

  const { status, result, log } = runWithFakeHome(fakeHome, script)
  assertEqual(status, 0, `子进程应该正常退出，日志：\n${log}`)
  assert(result, `子进程必须写出结果文件。日志：\n${log}`)

  // 3) 断言
  assertEqual(resolve(result.stateDir), resolve(join(fakeHome, '.dsh', 'minimal-router')), 'STATE_DIR 必须落在伪造的家目录里')
  assertEqual(result.exists, true, '新位置必须出现数据文件')
  assertEqual(result.count, LEGACY_COUNT, `记录数必须一条不少（期望 ${LEGACY_COUNT}，实际 ${result.count}）`)
  assertEqual(result.target.includes('plugins'), false, '数据不该还留在插件目录里')
  assert(result.tools.includes('route_status'), '迁移之后插件仍要正常注册工具')
  assert(result.tools.includes('cache_probe_report'), '探针工具必须在')
})

await test('搬家：重复加载不会覆盖已有数据（幂等）', () => {
  const LEGACY_COUNT = 3
  const fakeHome = join(workdir, 'home-idempotent')
  const oldPkg = join(fakeHome, 'pkg')
  mkdirSync(oldPkg, { recursive: true })
  copyPackageTo(oldPkg)
  writeLegacyData(oldPkg, LEGACY_COUNT)

  const script = join(fakeHome, 'load-twice.mjs')
  const out = join(fakeHome, 'twice.json')
  writeFileSync(
    script,
    `
import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import { writeFileSync } from 'node:fs'

const url = ${JSON.stringify(pathToFileURL(join(oldPkg, 'index.js')).href)}
const mod = await import(url)
const tools = new Map()
const makeCtx = () => ({
  effect(fn) { const d = fn(); return typeof d === 'function' ? d : () => {} },
  on() { return () => {} },
  get(n) { return n === 'agentDefaultModel' ? { provider: 'test', model: 'deepseek-flash' } : undefined },
  systemPrompt: { context() { return () => {} } },
  tools: { register(d) { tools.set(d.name, d) }, schemas: () => [], get: (n) => tools.get(n) },
})

const target = mod.pickProbeDataFile({})
mod.apply(makeCtx(), {})
const afterFirst = readFileSync(target, 'utf8').split('\\n').filter(Boolean).length

// 模拟"新版本又写了一条新记录"
appendFileSync(target, JSON.stringify({ v: 1, at: 1, note: 'brand-new' }) + '\\n', 'utf8')

// 再加载一次：绝不能把新记录冲掉
mod.apply(makeCtx(), {})
const afterSecond = readFileSync(target, 'utf8').split('\\n').filter(Boolean).length

writeFileSync(process.argv[2], JSON.stringify({ afterFirst, afterSecond, exists: existsSync(target) }))
`,
    'utf8',
  )

  const { status, result, log } = runWithFakeHome(fakeHome, script)
  assertEqual(status, 0, `子进程应该正常退出，日志：\n${log}`)
  assertEqual(result.afterFirst, LEGACY_COUNT)
  assertEqual(result.afterSecond, LEGACY_COUNT + 1, '再次加载不该覆盖已有数据（搬家只做一次）')
})

await test('清理临时目录', () => {
  rmSync(workdir, { recursive: true, force: true })
})

run()
