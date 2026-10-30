/**
 * dsh-cache-probe 的自测脚本（不需要装进 DSH 就能跑）
 *
 * 跑法：node test/probe.test.mjs
 *
 * 覆盖三块：
 *   1. 纯函数（指纹、记录、汇总、流包装）
 *   2. 存储（追加/读取/清空）
 *   3. 集成（真的调 apply()，喂一条假流，看记录有没有落盘）
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'

import {
  fnv1a,
  safeStringify,
  describeRequest,
  makeRecord,
  summarize,
  wrapStream,
  splitWaterfallArgs,
  round4,
} from '../lib/probe-core.js'
import { createStore } from '../lib/probe-store.js'
import { applyProbe as apply, normalizeConfig } from '../lib/probe.js'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0
const failures = []
const startedAt = Date.now()

async function test(title, fn) {
  try {
    await fn()
    passed += 1
    console.log(`${GREEN}\u2714 PASS${RESET}  ${DIM}${String(passed + failed).padStart(2, '0')}${RESET}  ${title}`)
  } catch (error) {
    failed += 1
    failures.push({ title, error })
    console.log(`${RED}\u2716 FAIL${RESET}  ${DIM}${String(passed + failed).padStart(2, '0')}${RESET}  ${title}`)
    console.log(`      ${RED}${error && error.message ? error.message : String(error)}${RESET}`)
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || '断言失败')
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || '值不相等'}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  }
}

/** 造一个合法形状的 GenerateOptions */
function makeOptions(overrides = {}) {
  const base = {
    provider: 'deepseek-account',
    model: 'deepseek-flash',
    system: 'You are an AI agent powered by DeepSeek Harness.',
    tools: [
      { name: 'read', description: 'Read a file.', parameters: { type: 'object' } },
      { name: 'write', description: 'Write a file.', parameters: { type: 'object' } },
    ],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  }
  return { ...base, ...overrides }
}

/** 造一个「系统提示以 system 消息形式出现」的请求（这才是 DSH 的真实形态） */
function makeOptionsWithSystemMessage(systemText = 'You are an AI agent powered by DeepSeek Harness.') {
  return {
    provider: 'deepseek-account',
    model: 'deepseek-flash',
    system: '',
    tools: [{ name: 'read', description: 'Read a file.', parameters: { type: 'object' } }],
    messages: [
      { role: 'system', content: [{ type: 'text', text: systemText }] },
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ],
  }
}

async function* fakeStream(chunks) {
  for (const chunk of chunks) yield chunk
}

/** 轮询直到条件成立或超时（等异步落盘用） */
async function waitFor(check, timeoutMs = 2000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return false
}

console.log(`\n${BOLD}dsh-cache-probe · 自测套件${RESET}\n`)

// ============================================================================
// 1. 指纹
// ============================================================================
await test('指纹：同一个输入永远算出同一个值', () => {
  const a = fnv1a('hello world')
  const b = fnv1a('hello world')
  assertEqual(a, b)
  assertEqual(a.length, 8, '应该是 8 位十六进制')
})

await test('指纹：改一个字符就变（这是整件事的地基）', () => {
  assert(fnv1a('abc') !== fnv1a('abd'), '不同内容必须得到不同指纹')
  assert(fnv1a('') === fnv1a(''), '空串也要稳定')
})

await test('safeStringify：循环引用不抛错', () => {
  const loop = { name: 'x' }
  loop.self = loop
  assertEqual(safeStringify(loop), '', '循环引用应返回空串而不是抛错')
  assertEqual(safeStringify({ ok: 1 }), '{"ok":1}')
})

// ============================================================================
// 2. 请求形状
// ============================================================================
await test('形状：能数出 system / 工具 / 消息的长度', () => {
  const desc = describeRequest(makeOptions())
  assertEqual(desc.provider, 'deepseek-account')
  assertEqual(desc.model, 'deepseek-flash')
  assertEqual(desc.tools, 2)
  assertEqual(desc.messages, 1)
  assert(desc.systemChars > 0, 'systemChars 应该大于 0')
  assert(desc.toolsChars > 0, 'toolsChars 应该大于 0')
})

await test('形状：同一个请求两次 → 指纹完全相同', () => {
  const a = describeRequest(makeOptions()).prefixSig
  const b = describeRequest(makeOptions()).prefixSig
  assertEqual(a, b)
})

await test('形状：系统提示改一个字 → 指纹必变（缓存必死）', () => {
  const a = describeRequest(makeOptions()).prefixSig
  const b = describeRequest(makeOptions({ system: 'You are an AI agent powered by DeepSeek Harness. ' })).prefixSig
  assert(a !== b, '系统提示变了，指纹必须变')
})

await test('形状：工具描述改一个字 → 指纹必变（最阴的坑）', () => {
  const a = describeRequest(makeOptions()).prefixSig
  const changed = makeOptions()
  changed.tools[0].description = 'Read a file!'
  const b = describeRequest(changed).prefixSig
  assert(a !== b, '工具描述变了，指纹必须变')
})

await test('形状：工具顺序变了 → 指纹也要变（别指望它自己归一化）', () => {
  const a = describeRequest(makeOptions()).prefixSig
  const swapped = makeOptions()
  swapped.tools = [swapped.tools[1], swapped.tools[0]]
  const b = describeRequest(swapped).prefixSig
  assert(a !== b, '顺序变了指纹应变化')
})

await test('形状：脏输入（null / 空对象）不抛错', () => {
  const a = describeRequest(null)
  const b = describeRequest({})
  assertEqual(a.tools, 0)
  assertEqual(b.tools, 0)
  assert(a.prefixSig.length === 8)
  assert(b.prefixSig.length === 8)
})

await test('形状：系统提示在 system 消息里时，长度和指纹都要算进去（真实形态）', () => {
  const desc = describeRequest(makeOptionsWithSystemMessage())
  assert(desc.systemChars > 0, 'systemChars 必须大于 0，否则说明漏算了系统提示')
  assertEqual(desc.systemMessages, 1, '应该识别出 1 条 system 消息')
  assertEqual(desc.messages, 2)
})

await test('形状：system 消息改一个字 → 指纹必变（这是我第一版漏掉的坑）', () => {
  const a = describeRequest(makeOptionsWithSystemMessage()).prefixSig
  const b = describeRequest(makeOptionsWithSystemMessage('You are an AI agent powered by DeepSeek Harness!')).prefixSig
  assert(a !== b, '系统提示以消息形式存在时，改它也必须改变指纹')
})

// ============================================================================
// 3. 记录
// ============================================================================
await test('记录：命中率分母是 promptTokens（input + cached）', () => {
  const desc = describeRequest(makeOptions())
  // DeepSeek 语义：200 是新增未命中，800 是命中缓存 → 总数 1000，命中率 80%
  const record = makeRecord(desc, { inputTokens: 200, cacheReadTokens: 800, outputTokens: 50 }, 1700000000000)
  assertEqual(record.promptTokens, 1000)
  assertEqual(record.hitRate, 0.8)
  assertEqual(record.inputTokens, 200)
  assertEqual(record.cacheReadTokens, 800)
  assertEqual(record.stage, 'n/a', 'S0 阶段还没有路由器')
})

await test('记录：inputTokens 为 0 时命中率是 0，不是 NaN', () => {
  const desc = describeRequest(makeOptions())
  const record = makeRecord(desc, { inputTokens: 0, cacheReadTokens: 0 }, 1700000000000)
  assertEqual(record.hitRate, 0)
  assert(Number.isFinite(record.hitRate), '不允许出现 NaN')
})

await test('记录：字段齐全且是无损 JSON（没有 undefined）', () => {
  const desc = describeRequest(makeOptions())
  const record = makeRecord(desc, { inputTokens: 500, cacheReadTokens: 250, outputTokens: 10 }, 1700000000000)
  const roundTrip = JSON.parse(JSON.stringify(record))
  assertEqual(JSON.stringify(roundTrip), JSON.stringify(record), '序列化前后必须完全一致')
  for (const [key, value] of Object.entries(roundTrip)) {
    assert(value !== undefined, `${key} 不允许是 undefined`)
  }
  assert(roundTrip.iso.length > 0, 'iso 时间戳必须有值')
})

// ============================================================================
// 4. 汇总
// ============================================================================
await test('汇总：空数组返回全 0，不是 NaN', () => {
  const s = summarize([])
  assertEqual(s.count, 0)
  assertEqual(s.avgHitRate, 0)
  assertEqual(s.prefixChanges, 0)
  assert(Number.isFinite(s.minHitRate) && Number.isFinite(s.maxHitRate))
})

await test('汇总：prefixChanges 数得对（A,A,B,B,A → 2 次变化）', () => {
  const s = summarize([
    { prefixSig: 'A', hitRate: 0.9, tools: 10 },
    { prefixSig: 'A', hitRate: 0.95, tools: 10 },
    { prefixSig: 'B', hitRate: 0.1, tools: 12 },
    { prefixSig: 'B', hitRate: 0.8, tools: 12 },
    { prefixSig: 'A', hitRate: 0.85, tools: 10 },
  ])
  assertEqual(s.count, 5)
  assertEqual(s.prefixChanges, 2, 'A→B 一次，B→A 一次')
  assertEqual(s.distinctPrefixes, 2)
  assertEqual(s.toolsCount, 10, '取最后一条的 tools 数')
})

await test('汇总：平均/最小/最大命中率', () => {
  const s = summarize([
    { prefixSig: 'A', hitRate: 0.5, tools: 1 },
    { prefixSig: 'A', hitRate: 1.0, tools: 1 },
    { prefixSig: 'A', hitRate: 0.0, tools: 1 },
  ])
  assertEqual(s.avgHitRate, 0.5)
  assertEqual(s.minHitRate, 0)
  assertEqual(s.maxHitRate, 1)
})

await test('汇总：round4 去掉浮点尾巴', () => {
  assertEqual(round4(0.123456), 0.1235)
  assertEqual(round4(1), 1)
})

// ============================================================================
// 5. 流包装（最关键：绝不能改模型输出）
// ============================================================================
await test('流：chunk 原样透传，数量和顺序都不变', async () => {
  const chunks = [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: '你好' },
    { type: 'usage', usage: { inputTokens: 100, cacheReadTokens: 60 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const out = []
  for await (const chunk of wrapStream(fakeStream(chunks), () => {})) out.push(chunk)
  assertEqual(out.length, chunks.length)
  for (let i = 0; i < chunks.length; i += 1) {
    assert(out[i] === chunks[i], `第 ${i} 个 chunk 必须是原对象（引用相等）`)
  }
})

await test('流：usage 块被捕获到', async () => {
  const seen = []
  const chunks = [
    { type: 'text-delta', index: 0, text: 'x' },
    { type: 'usage', usage: { inputTokens: 100, cacheReadTokens: 60 } },
  ]
  for await (const _ of wrapStream(fakeStream(chunks), (usage) => seen.push(usage))) {
    // 消费完
  }
  assertEqual(seen.length, 1)
  assertEqual(seen[0].cacheReadTokens, 60)
})

await test('流：回调抛错也不能打断模型输出', async () => {
  const chunks = [{ type: 'usage', usage: { inputTokens: 1 } }, { type: 'finish', reason: { kind: 'stop' } }]
  let count = 0
  for await (const _ of wrapStream(fakeStream(chunks), () => {
    throw new Error('回调故意炸')
  })) {
    count += 1
  }
  assertEqual(count, 2, '两个 chunk 都要透传出去')
})

await test('流：坏 chunk（null / 没 type）不抛错', async () => {
  const chunks = [null, { foo: 1 }, { type: 'usage' }, { type: 'usage', usage: {} }]
  const seen = []
  for await (const chunk of wrapStream(fakeStream(chunks), (u) => seen.push(u))) seen.push(chunk)
  assert(seen.length > 0)
})

await test('瀑布参数：能从任意位置抠出 next', () => {
  const next = () => 'NEXT'
  const a = splitWaterfallArgs([{ provider: 'x' }, next])
  assertEqual(a.next, next)
  assertEqual(a.options.provider, 'x')
  const b = splitWaterfallArgs([{ provider: 'y' }])
  assertEqual(b.next, undefined, '没有 next 时要返回 undefined 而不是抛错')
})

// ============================================================================
// 6. 存储
// ============================================================================
await test('存储：追加后能读回来，坏行被跳过', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'probe-store-'))
  const file = join(dir, 'usage.jsonl')
  try {
    const store = createStore({ file })
    await store.append({ a: 1 })
    await store.append({ a: 2 })
    await store.append({ a: 3 })
    const all = await store.read(10)
    assertEqual(all.length, 3)
    assertEqual(all[2].a, 3)
    assertEqual(await store.count(), 3)

    // 手工塞一行坏数据，读取时应该跳过而不是整体失败
    const { appendFile } = await import('node:fs/promises')
    await appendFile(file, 'this is not json\n', 'utf8')
    const again = await store.read(10)
    assertEqual(again.length, 3, '坏行必须被跳过')

    // limit 只取最后 N 条
    const tail = await store.read(2)
    assertEqual(tail.length, 2)
    assertEqual(tail[1].a, 3)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

await test('存储：clear 清空', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'probe-clear-'))
  const file = join(dir, 'usage.jsonl')
  try {
    const store = createStore({ file })
    await store.append({ a: 1 })
    assertEqual(await store.clear(), true)
    assertEqual(await store.count(), 0)
    assertEqual((await store.read(10)).length, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// ============================================================================
// 7. 集成：真的调 apply()
// ============================================================================
function makeFakeCtx() {
  const listeners = new Map()
  const tools = new Map()
  const disposers = []
  const ctx = {
    effect(fn) {
      const disposer = fn()
      if (typeof disposer === 'function') disposers.push(disposer)
      return disposer
    },
    on(eventName, listener) {
      const list = listeners.get(eventName) || []
      list.push(listener)
      listeners.set(eventName, list)
      return () => {}
    },
    tools: {
      register(definition) {
        if (tools.has(definition.name)) throw new Error(`工具重名：${definition.name}`)
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
    get() {
      return undefined
    },
  }
  return { ctx, listeners, tools, disposers }
}

await test('集成：插件注册了 2 个工具 + 1 个监听器', () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { dataFile: '' })
  assert(rt.tools.has('cache_probe_report'), '缺少 cache_probe_report')
  assert(rt.tools.has('cache_probe_clear'), '缺少 cache_probe_clear')
  assertEqual((rt.listeners.get('llm/stream') || []).length, 1)
})

await test('集成：监听器返回的是 AsyncIterable（不是 Promise）', () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { dataFile: '' })
  const handler = (rt.listeners.get('llm/stream') || [])[0]
  const result = handler(makeOptions(), () => fakeStream([{ type: 'finish', reason: { kind: 'stop' } }]))
  assert(typeof result[Symbol.asyncIterator] === 'function', '必须同步返回异步迭代器，否则瀑布链会断')
})

await test('集成：端到端 —— 喂一条假流，记录真的落盘且数字正确', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'probe-e2e-'))
  const file = join(dir, 'usage.jsonl')
  try {
    const rt = makeFakeCtx()
    apply(rt.ctx, { dataFile: file, logToConsole: false })
    const handler = (rt.listeners.get('llm/stream') || [])[0]

    const chunks = [
      { type: 'text-delta', index: 0, text: 'ok' },
      { type: 'usage', usage: { inputTokens: 800, cacheReadTokens: 19200, cacheWriteTokens: 0, outputTokens: 300 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]

    const collected = []
    for await (const chunk of handler(makeOptions(), () => fakeStream(chunks))) collected.push(chunk)
    assertEqual(collected.length, 3, '3 个 chunk 都要出去')

    const ok = await waitFor(async () => {
      try {
        const text = await readFile(file, 'utf8')
        return text.trim().length > 0
      } catch {
        return false
      }
    })
    assert(ok, '记录应该在 2 秒内落盘')

    const record = JSON.parse((await readFile(file, 'utf8')).trim().split('\n')[0])
    assertEqual(record.promptTokens, 20000)
    assertEqual(record.inputTokens, 800)
    assertEqual(record.cacheReadTokens, 19200)
    assertEqual(record.hitRate, 0.96)
    assertEqual(record.tools, 2)
    assertEqual(record.model, 'deepseek-flash')
    assertEqual(record.stage, 'n/a')
    assert(record.prefixSig.length === 8)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

await test('集成：report 工具能读到刚才的记录', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'probe-report-'))
  const file = join(dir, 'usage.jsonl')
  try {
    const rt = makeFakeCtx()
    apply(rt.ctx, { dataFile: file, logToConsole: false })
    const handler = (rt.listeners.get('llm/stream') || [])[0]

    for (const input of [1000, 2000]) {
      const chunks = [{ type: 'usage', usage: { inputTokens: 0, cacheReadTokens: input } }]
      for await (const _ of handler(makeOptions(), () => fakeStream(chunks))) {
        // 消费
      }
    }

    const ok = await waitFor(async () => (await rt.tools.get('cache_probe_report').execute({})).total >= 2)
    assert(ok, '两条记录都应该落盘')

    const report = await rt.tools.get('cache_probe_report').execute({ limit: 10 })
    assertEqual(report.total, 2)
    assertEqual(report.summary.count, 2)
    assertEqual(report.summary.avgHitRate, 1, '两次都全命中')
    assertEqual(report.summary.prefixChanges, 0, '前缀没变过')
    assertEqual(report.recent.length, 2)
    assertEqual(report.file, file)
    // 无损 JSON
    assertEqual(JSON.stringify(JSON.parse(JSON.stringify(report))), JSON.stringify(report))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

await test('集成：clear 工具能清空', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'probe-clr-'))
  const file = join(dir, 'usage.jsonl')
  try {
    const rt = makeFakeCtx()
    apply(rt.ctx, { dataFile: file, logToConsole: false })
    const handler = (rt.listeners.get('llm/stream') || [])[0]
    for await (const _ of handler(makeOptions(), () => fakeStream([{ type: 'usage', usage: { inputTokens: 1 } }]))) {
      // 消费
    }
    await waitFor(async () => (await rt.tools.get('cache_probe_report').execute({})).total >= 1)
    const cleared = await rt.tools.get('cache_probe_clear').execute({})
    assertEqual(cleared.cleared, true)
    const after = await rt.tools.get('cache_probe_report').execute({})
    assertEqual(after.total, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

await test('配置：脏数据自动回退，且默认落盘路径是插件目录', () => {
  const cfg = normalizeConfig({})
  assert(cfg.dataFile.includes('data'), '默认应该落在 data 目录')
  assert(cfg.dataFile.includes('dsh-minimal-router'), '应该落在合并后的包里')
  assertEqual(cfg.reportLimit, 20)
  const weird = normalizeConfig({ reportLimit: -5, dataFile: 123, logToConsole: 'yes' })
  assertEqual(weird.reportLimit, 20, '非法 limit 回退默认')
  assertEqual(typeof weird.dataFile, 'string')
})

// ============================================================================
// 汇总
// ============================================================================
const elapsed = Date.now() - startedAt
console.log('')
console.log('============================================================')
if (failed === 0) {
  console.log(`${GREEN}${BOLD}  \u2705 ALL ${passed} TESTS PASSED${RESET}  ${DIM}(${elapsed}ms / 0 failed)${RESET}`)
  console.log('============================================================\n')
  process.exit(0)
} else {
  console.log(`${RED}${BOLD}  \u274c ${failed} FAILED / ${passed} PASSED${RESET}  ${DIM}(${elapsed}ms)${RESET}`)
  console.log('============================================================')
  for (const f of failures) {
    console.log(`${RED}- ${f.title}${RESET}`)
    console.log(`  ${f.error && f.error.stack ? f.error.stack.split('\n').slice(0, 3).join('\n  ') : String(f.error)}`)
  }
  console.log('')
  process.exit(1)
}
