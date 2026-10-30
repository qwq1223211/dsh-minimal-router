/**
 * "测仪器本身"。
 *
 * 【为什么单独一个文件】覆盖率统计显示，本项目里覆盖率最低的几个模块恰好是
 * **所有对外数字的来源**：probe-core 30%、probe-store 38%、guard 50%。
 * 如果量尺子本身是坏的，README 里那些 −67.2% / 99.16% 就全不可信。
 *
 * 所以这里专攻：哈希、序列化、请求形状、记录合成、汇总、流包装、存储轮转、熔断状态机。
 */
import { test, run, assert, assertEqual } from './harness.mjs'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  fnv1a,
  safeStringify,
  describeRequest,
  makeRecord,
  round4,
  summarize,
  wrapStream,
  emptyIterable,
  splitWaterfallArgs,
  RECORD_VERSION,
} from '../lib/probe-core.js'
import { createStore, DEFAULT_MAX_BYTES } from '../lib/probe-store.js'
import { createBreaker, normalizeConfig, toolNameOf, keyOf, isErrorResult, errorMessageOf, clip } from '../lib/guard.js'

const dir = mkdtempSync(join(tmpdir(), 'router-instrument-'))

// ===========================================================================
// 1. 哈希与序列化（前缀指纹的基础）
// ===========================================================================
await test('probe: fnv1a 稳定且区分输入', () => {
  const a = fnv1a('hello')
  assertEqual(fnv1a('hello'), a, '同样输入必须同样输出')
  assert(/^[0-9a-f]+$/.test(a), `应该是十六进制，实际 ${a}`)
  assert(fnv1a('hello') !== fnv1a('hellp'), '差一个字符必须不同')
  assertEqual(fnv1a('').length > 0, true, '空串也要有指纹')
  assertEqual(fnv1a(123).length > 0, true, '非字符串不该崩')
})

await test('probe: safeStringify 绝不抛异常（序列化不了就返回空串）', () => {
  const cyclic = { name: 'a' }
  cyclic.self = cyclic
  // 契约是"永不抛"，不是"一定能序列化"：循环引用/BigInt 会返回空串
  assertEqual(safeStringify(cyclic), '', '循环引用应回退成空串，而不是抛异常')
  assertEqual(safeStringify({ n: 123n }), '', 'BigInt 应回退成空串')
  assertEqual(safeStringify({ ok: 1 }), '{"ok":1}', '普通对象正常序列化')
  assertEqual(safeStringify(undefined), '', 'undefined 回退成空串')
})

// ===========================================================================
// 2. 请求形状（prefixSig 从哪来）
// ===========================================================================
await test('probe: describeRequest 数得清消息、工具和系统提示', () => {
  const desc = describeRequest({
    provider: 'deepseek-account',
    model: 'deepseek-flash',
    system: '你是助手',
    messages: [
      { role: 'system', content: [{ type: 'text', text: '系统提示' }] },
      { role: 'user', content: '你好' },
    ],
    tools: [
      { name: 'read', description: 'x', parameters: {} },
      { name: 'write', description: 'y', parameters: {} },
    ],
  })
  assertEqual(desc.provider, 'deepseek-account')
  assertEqual(desc.model, 'deepseek-flash')
  assertEqual(desc.messages, 2)
  assertEqual(desc.tools, 2)
  assert(desc.toolsChars > 0, '工具字节数要算出来')
  assert(desc.systemChars > 0, `系统提示字符数要算出来，实际 ${desc.systemChars}`)
  assert(/^[0-9a-f]+$/.test(desc.prefixSig), '要有前缀指纹')
})

await test('probe: prefixSig 对同一请求稳定，工具变了就变', () => {
  const base = {
    provider: 'p',
    model: 'm',
    messages: [{ role: 'user', content: 'hi' }],
    tools: [{ name: 'read', description: 'x', parameters: {} }],
  }
  const a = describeRequest(base).prefixSig
  const b = describeRequest(base).prefixSig
  assertEqual(a, b, '同样请求必须同样指纹（否则会误报前缀变化）')

  const changed = describeRequest({
    ...base,
    tools: [{ name: 'read', description: 'x', parameters: {} }, { name: 'write', description: 'y', parameters: {} }],
  }).prefixSig
  assert(a !== changed, '工具变了指纹必须变')
})

await test('probe: describeRequest 对空/怪输入不崩', () => {
  for (const bad of [undefined, null, {}, { messages: 'x' }, { tools: 42 }, { messages: [null, 1] }]) {
    const desc = describeRequest(bad)
    assertEqual(typeof desc.prefixSig, 'string')
    assert(desc.messages >= 0)
    assert(desc.tools >= 0)
  }
})

// ===========================================================================
// 3. 记录合成与汇总（README 里那些数字的算法）
// ===========================================================================
await test('probe: makeRecord 的 promptTokens / hitRate 算得对', () => {
  const desc = describeRequest({ messages: [], tools: [] })
  const record = makeRecord(desc, { inputTokens: 216, cacheReadTokens: 25472, cacheWriteTokens: 0, outputTokens: 40 }, 1000)
  assertEqual(record.promptTokens, 216 + 25472, 'prompt = 新增 + 命中')
  assertEqual(record.hitRate, round4(25472 / (216 + 25472)))
  assertEqual(record.v, RECORD_VERSION)
  assertEqual(record.at, 1000)
})

await test('probe: makeRecord 永远不产生 undefined 字段（DSH 要求无损 JSON）', () => {
  const desc = describeRequest({})
  for (const usage of [{}, { inputTokens: null }, { inputTokens: 'x', cacheReadTokens: -5 }, undefined]) {
    const record = makeRecord(desc, usage, 1)
    for (const [key, value] of Object.entries(record)) {
      assertEqual(value === undefined, false, `字段 ${key} 是 undefined`)
    }
    assertEqual(JSON.stringify(JSON.parse(JSON.stringify(record))), JSON.stringify(record), '必须是无损 JSON')
  }
})

await test('probe: hitRate 在 0 请求时不会变成 NaN', () => {
  const record = makeRecord(describeRequest({}), {}, 1)
  assertEqual(Number.isFinite(record.hitRate), true, `hitRate 不该是 ${record.hitRate}`)
})

await test('probe: summarize 能算出命中率、前缀变化次数和最近一次', () => {
  const desc = describeRequest({ messages: [], tools: [] })
  const records = [
    makeRecord(desc, { inputTokens: 100, cacheReadTokens: 900 }, 1),
    { ...makeRecord(desc, { inputTokens: 50, cacheReadTokens: 950 }, 2), prefixSig: 'other' },
  ]
  const summary = summarize(records)
  assertEqual(typeof summary.avgHitRate, 'number')
  assert(summary.count >= 2)
  assert(summary.prefixChanges >= 1, '指纹变了要算一次前缀变化')
  assertEqual(typeof summary.lastHitRate, 'number')
})

await test('probe: summarize 对空数组和垃圾输入不崩', () => {
  for (const bad of [[], null, undefined, [null, 1, 'x'], {}]) {
    const summary = summarize(bad)
    assertEqual(typeof summary.avgHitRate, 'number')
    assertEqual(Number.isFinite(summary.avgHitRate), true, '平均命中率不该是 NaN')
  }
})

await test('probe: round4 只保留四位', () => {
  assertEqual(round4(0.123456789), 0.1235)
  assertEqual(round4(1), 1)
  assertEqual(round4('x'), 0)
})

// ===========================================================================
// 4. 流包装（绝不能改变模型输出）
// ===========================================================================
await test('probe: wrapStream 原样透传 chunk 并抓到 usage', async () => {
  const seen = []
  function inner() {
    return (async function* () {
      yield { type: 'text', text: 'a' }
      yield { type: 'usage', usage: { inputTokens: 10, cacheReadTokens: 90 } }
      yield { type: 'text', text: 'b' }
    })()
  }
  const out = []
  for await (const chunk of wrapStream(inner(), (usage) => seen.push(usage))) out.push(chunk)
  assertEqual(out.length, 3, '一个 chunk 都不能丢')
  assertEqual(out[0].text, 'a')
  assertEqual(out[2].text, 'b')
  assertEqual(seen.length, 1, 'usage 要被观察到一次')
  assertEqual(seen[0].inputTokens, 10)
})

await test('probe: wrapStream 不吞错误（429 / 断网必须原样抛出）', async () => {
  const boom = new Error('模拟 429')
  function inner() {
    return (async function* () {
      yield { type: 'text', text: '前半截' }
      throw boom
    })()
  }
  const got = []
  let caught = null
  try {
    for await (const chunk of wrapStream(inner(), () => {})) got.push(chunk)
  } catch (error) {
    caught = error
  }
  assertEqual(got.length, 1, '错误前的 chunk 要透传')
  assert(caught && caught.message === boom.message, '错误必须原样冒出来')
})

await test('probe: wrapStream 接受 Promise 形式的流（不是 iterable 也能吃）', async () => {
  const stream = async function* () {
    yield { type: 'text', text: 'x' }
  }
  const out = []
  for await (const chunk of wrapStream(Promise.resolve(stream()), () => {})) out.push(chunk)
  assertEqual(out.length, 1)
})

await test('probe: emptyIterable 什么都不产出', async () => {
  const out = []
  for await (const chunk of emptyIterable()) out.push(chunk)
  assertEqual(out.length, 0)
})

await test('probe: splitWaterfallArgs 把最后一个函数当 next', () => {
  const next = () => 'ok'
  const { options, next: got } = splitWaterfallArgs([{ a: 1 }, 'x', next])
  assertEqual(options.a, 1)
  assertEqual(got, next)
  const none = splitWaterfallArgs([{ a: 2 }])
  assertEqual(none.next, undefined, '没有 next 时应该是 undefined')
  assertEqual(splitWaterfallArgs(undefined).options, undefined, '空参数时 options 是 undefined')
})

// ===========================================================================
// 5. 存储：追加 / 读取 / 轮转 / 坏行
// ===========================================================================
await test('store: 追加后能读回来（返回数组，时间升序，只留最后 N 条）', async () => {
  const file = join(dir, 'a.jsonl')
  const store = createStore({ file })
  for (let i = 1; i <= 3; i += 1) await store.append({ i })
  const records = await store.read(10)
  assertEqual(records.length, 3)
  assertEqual(records[records.length - 1].i, 3, '最后一条应该是最新的')
})

await test('store: read(limit) 只返回最后 N 条', async () => {
  const file = join(dir, 'b.jsonl')
  const store = createStore({ file })
  for (let i = 1; i <= 6; i += 1) await store.append({ i })
  const records = await store.read(2)
  assertEqual(records.length, 2)
  assertEqual(records[1].i, 6, '最后一条是 6')
})

await test('store: 坏行被跳过，不影响读取', async () => {
  const file = join(dir, 'c.jsonl')
  const store = createStore({ file })
  await store.append({ i: 1 })
  writeFileSync(file, `${readFileSync(file, 'utf8')}{坏掉的 JSON\n`, 'utf8')
  const records = await store.read(10)
  assertEqual(records.length, 1, '坏行必须被跳过')
})

await test('store: 读不存在的文件不抛异常', async () => {
  const store = createStore({ file: join(dir, 'nope.jsonl') })
  const records = await store.read(5)
  assert(Array.isArray(records), '应该返回空数组')
  assertEqual(records.length, 0)
})

await test('store: 超过 maxBytes 会轮转（不无限增长）', async () => {
  const file = join(dir, 'd.jsonl')
  const store = createStore({ file, maxBytes: 200 })
  for (let i = 0; i < 60; i += 1) await store.append({ i, pad: 'x'.repeat(40) })
  const size = existsSync(file) ? readFileSync(file, 'utf8').length : 0
  assert(size <= 200 * 3, `轮转后不该还这么大：${size} 字节`)
  assertEqual(DEFAULT_MAX_BYTES, 2 * 1024 * 1024)
})

// ===========================================================================
// 6. 熔断器状态机
// ===========================================================================
await test('guard: normalizeConfig 对垃圾配置回退默认', () => {
  const cfg = normalizeConfig({ maxConsecutiveErrors: 'x', exemptTools: 'nope' })
  assertEqual(typeof cfg.maxConsecutiveErrors, 'number')
  assert(Array.isArray(cfg.exemptTools))
  assertEqual(normalizeConfig(null).maxConsecutiveErrors, normalizeConfig({}).maxConsecutiveErrors)
})

await test('guard: toolNameOf / keyOf / isErrorResult / errorMessageOf / clip', () => {
  assertEqual(toolNameOf({ name: 'read' }), 'read')
  assertEqual(toolNameOf(null), '')
  assertEqual(keyOf({ agent: { id: 's1' } }), 's1')
  assertEqual(keyOf({ id: 's2' }), 's2')
  assertEqual(keyOf(null), '__global__')

  assertEqual(isErrorResult({ isError: true }), true)
  assertEqual(isErrorResult({ isError: false }), false)
  assertEqual(isErrorResult(null), false)

  assert(errorMessageOf({ isError: true, content: [{ type: 'text', text: '炸了' }] }).includes('炸了'))
  assertEqual(errorMessageOf(null), '')
  assertEqual(errorMessageOf({ isError: true }, 5).length <= 6, true, '要受 maxChars 约束')

  assertEqual(clip('abcdef', 3).startsWith('abc'), true)
  assertEqual(clip('ab', 10), 'ab')
})

await test('guard: 连续失败到阈值会熔断，reset 能恢复', () => {
  const breaker = createBreaker({ maxConsecutiveErrors: 3 })
  const key = 'g1'
  breaker.observe(key, 'unity_object_create', true, 'boom')
  breaker.observe(key, 'unity_object_create', true, 'boom')
  assertEqual(breaker.status(key).session.tripped, false, '两次不该熔断')
  breaker.observe(key, 'unity_object_create', true, 'boom')
  const status = breaker.status(key).session
  assertEqual(status.tripped, true, '三次应该熔断')
  assert(status.consecutiveErrors >= 3)

  breaker.reset(key)
  assertEqual(breaker.status(key).session.tripped, false, 'reset 之后应恢复')
  assertEqual(breaker.status(key).session.consecutiveErrors, 0)
})

await test('guard: 成功后计数清零', () => {
  const breaker = createBreaker({ maxConsecutiveErrors: 3 })
  const key = 'g2'
  breaker.observe(key, 'read', true, 'x')
  breaker.observe(key, 'read', true, 'x')
  breaker.observe(key, 'read', false, '')
  assertEqual(breaker.status(key).session.consecutiveErrors, 0, '一次成功就清零')
})

await test('guard: 熔断后 decidePre 返回拒绝文案，逃生门返回 undefined', () => {
  const breaker = createBreaker({ maxConsecutiveErrors: 1 })
  const exec = { name: 'unity_object_create', agent: { id: 'g3' } }
  breaker.observe('g3', 'unity_object_create', true, 'boom')
  const blocked = breaker.decidePre(exec)
  // 契约：拒绝时返回一段给模型看的中文说明；放行时返回 undefined
  assert(typeof blocked === 'string' && blocked.length > 0, `熔断后应该返回拒绝文案，实际 ${typeof blocked}`)
  assert(blocked.includes('熔断'), '文案里要说明已熔断')
  assert(blocked.includes('guard_reset'), '要告诉模型怎么解除')

  const escape = breaker.decidePre({ name: 'guard_reset', agent: { id: 'g3' } })
  assertEqual(escape, undefined, '逃生门必须放行（返回 undefined）')
})

await test('guard: 不同会话互不影响', () => {
  const breaker = createBreaker({ maxConsecutiveErrors: 1 })
  breaker.observe('a', 'x_y', true, 'boom')
  assertEqual(breaker.status('a').session.tripped, true)
  assertEqual(breaker.status('b').session.tripped, false, 'B 会话不该被 A 连累')
})

await test('清理临时目录', () => {
  rmSync(dir, { recursive: true, force: true })
})

run()
