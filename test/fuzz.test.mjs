/**
 * 模糊测试（fuzz）：用确定性伪随机输入，验证"绝不抛异常 + 不变量永远成立"。
 *
 * 【为什么要有它】手写用例只能覆盖"我想得到的情况"。
 * 这个插件的核心是一堆解析器（死循环扫描、阶段表校验、关键词识别、提示渲染），
 * 它们每天吃的是用户随手粘进来的文本 —— 那才是真正的输入分布。
 *
 * 原则：
 *   1. 绝不使用 Math.random（不可复现的失败等于没有失败）
 *   2. 每个不变量都写成断言，失败时打印出**能复现的输入**
 */
import { test, run } from './harness.mjs'
import { scanCode } from '../lib/lint.js'
import { validateStagesConfig, normalizeStagesShape } from '../lib/stages-config.js'
import { isExplicitSwitch, createSwitchArbiter } from '../lib/stage.js'
import { renderHint } from '../lib/prompt.js'
import { tagOf, buildCatalog, claimedTags, ALWAYS_ALLOW } from '../lib/classify.js'
import { estimateSwitchEconomy, decideByEconomy } from '../lib/cost.js'
import { DEFAULT_STAGES } from '../index.js'

/** 确定性 PRNG（mulberry32），保证每次跑同样的 5000 个用例 */
function prng(seed) {
  let a = seed >>> 0
  return function next() {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rnd = prng(0x5eed)

/** 各种"坏但合法"的字符池：控制字符、代理对、中文、emoji、零宽、引号、括号 */
const ALPHABET = [
  'a', 'Z', '0', '9', ' ', '\n', '\t', '\r', '\\', '"', "'", '`',
  '(', ')', '{', '}', '[', ']', '<', '>', '/', '*', '+', '-', '=', ';', ':', ',', '.',
  '中', '文', '切', '换', '阶', '段', '别', '不', '要',
  '😀', '🐟', '\u0000', '\u200b', '\uFEFF', '\uD800', '\uDC00',
  'while', 'true', 'for', ';;', 'break', 'return', 'throw',
]

function randomText(maxLen = 400) {
  const len = Math.floor(rnd() * maxLen)
  let out = ''
  for (let i = 0; i < len; i += 1) out += ALPHABET[Math.floor(rnd() * ALPHABET.length)]
  return out
}

/** 随机 JSON 值（用于喂配置校验器） */
function randomValue(depth = 0) {
  const roll = rnd()
  if (depth > 4) return roll < 0.5 ? randomText(20) : roll < 0.8 ? 1 : null
  if (roll < 0.2) return randomText(30)
  if (roll < 0.3) return Math.floor(rnd() * 1000) - 500
  if (roll < 0.4) return roll < 0.45
  if (roll < 0.5) return null
  if (roll < 0.6) return undefined
  if (roll < 0.8) {
    const arr = []
    const n = Math.floor(rnd() * 4)
    for (let i = 0; i < n; i += 1) arr.push(randomValue(depth + 1))
    return arr
  }
  const obj = {}
  const n = Math.floor(rnd() * 4)
  for (let i = 0; i < n; i += 1) obj[randomText(8)] = randomValue(depth + 1)
  return obj
}

const ITERATIONS = 800

// ---------------------------------------------------------------------------
// 1. 死循环扫描器：任何输入都不能抛，且必须返回 findings 数组
// ---------------------------------------------------------------------------
await test('fuzz：scanCode 对 800 个随机输入绝不抛异常', () => {
  for (let i = 0; i < ITERATIONS; i += 1) {
    const input = randomText()
    let result
    try {
      result = scanCode(input)
    } catch (error) {
      throw new Error(`scanCode 抛异常（第 ${i} 次），输入=${JSON.stringify(input)}：${error && error.message}`)
    }
    if (!result || !Array.isArray(result.findings)) {
      throw new Error(`scanCode 返回值不合约定（第 ${i} 次），输入=${JSON.stringify(input)}`)
    }
  }
})

await test('fuzz：scanCode 的结果永远是纯 JSON（不含 undefined / 函数）', () => {
  for (let i = 0; i < 200; i += 1) {
    const result = scanCode(randomText())
    const round = JSON.parse(JSON.stringify(result))
    if (JSON.stringify(round) !== JSON.stringify(result)) {
      throw new Error(`scanCode 结果不是无损 JSON（第 ${i} 次）：${JSON.stringify(result).slice(0, 200)}`)
    }
  }
})

// ---------------------------------------------------------------------------
// 2. 阶段表校验器：任何输入都不能抛，必须返回结构化结果
// ---------------------------------------------------------------------------
await test('fuzz：validateStagesConfig 对 800 个随机垃圾绝不抛异常', () => {
  for (let i = 0; i < ITERATIONS; i += 1) {
    const input = randomValue()
    let out
    try {
      out = validateStagesConfig(input)
    } catch (error) {
      throw new Error(`validateStagesConfig 抛异常（第 ${i} 次），输入=${JSON.stringify(input)}：${error && error.message}`)
    }
    if (!out || typeof out.ok !== 'boolean' || !Array.isArray(out.errors)) {
      throw new Error(`返回值不合约定（第 ${i} 次）`)
    }
    if (!out.ok && out.errors.length === 0) {
      throw new Error(`校验失败却没给原因（第 ${i} 次）`)
    }
  }
})

await test('fuzz：normalizeStagesShape 绝不吃数组里的垃圾元素', () => {
  for (let i = 0; i < 300; i += 1) {
    const errors = []
    const out = normalizeStagesShape(randomValue(), errors)
    if (out !== null && (typeof out !== 'object' || Array.isArray(out))) {
      throw new Error(`返回值类型不对（第 ${i} 次）`)
    }
    if (!Array.isArray(errors)) throw new Error('errors 必须是数组')
  }
})

// ---------------------------------------------------------------------------
// 3. 关键词识别：必须永远返回布尔值（不能是 undefined / truthy 对象）
// ---------------------------------------------------------------------------
await test('fuzz：isExplicitSwitch 对 800 个随机输入永远返回布尔值', () => {
  for (let i = 0; i < ITERATIONS; i += 1) {
    const input = randomText()
    const out = isExplicitSwitch(input)
    if (typeof out !== 'boolean') {
      throw new Error(`不是布尔值（第 ${i} 次），输入=${JSON.stringify(input)}，得到 ${typeof out}`)
    }
  }
  for (const bad of [null, undefined, 123, {}, [], true]) {
    if (typeof isExplicitSwitch(bad) !== 'boolean') throw new Error(`非字符串输入 ${typeof bad} 应该返回布尔值`)
  }
})

// ---------------------------------------------------------------------------
// 4. 尾部提示：无论标签多离谱，长度都不能超上限（红线）
// ---------------------------------------------------------------------------
await test('fuzz：renderHint 永远不会超过上限（这是缓存红线）', () => {
  for (let i = 0; i < 300; i += 1) {
    const claimed = new Set()
    const n = Math.floor(rnd() * 60)
    for (let k = 0; k < n; k += 1) claimed.add(randomText(12).trim() || 'x')
    const allow = [...claimed].slice(0, Math.floor(rnd() * 40))
    const stages = { s: { allow, keywords: [] } }
    const out = renderHint({ stage: 's', stages, claimed })
    if (out.length > 200) throw new Error(`提示超长 ${out.length}（第 ${i} 次）`)
    if (typeof out.truncated !== 'boolean') throw new Error('truncated 必须是布尔值')
  }
})

await test('fuzz：自定义上限也守得住（下限 40）', () => {
  const claimed = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'])
  const stages = { s: { allow: ['none'] } }
  for (const limit of [40, 41, 60, 199, 200, 201, 1000]) {
    const out = renderHint({ stage: 's', stages, claimed, limit })
    if (out.length > Math.max(40, Math.min(1000, limit))) {
      throw new Error(`limit=${limit} 时长度 ${out.length} 越界`)
    }
  }
})

// ---------------------------------------------------------------------------
// 5. 标签推导：任何工具名都要能算出标签（空标签会让"未认领放行"失效）
// ---------------------------------------------------------------------------
await test('fuzz：tagOf 对任意工具名都返回小写非空标签', () => {
  for (let i = 0; i < 500; i += 1) {
    const name = randomText(24)
    const tag = tagOf(name, [])
    if (typeof tag !== 'string' || tag.length === 0) {
      throw new Error(`空标签（第 ${i} 次），工具名=${JSON.stringify(name)}`)
    }
    if (tag !== tag.toLowerCase()) {
      throw new Error(`标签不是小写（第 ${i} 次）：${tag}`)
    }
  }
})

await test('fuzz：buildCatalog 对随机工具名不崩，总数对得上', () => {
  for (let i = 0; i < 100; i += 1) {
    const names = []
    const n = Math.floor(rnd() * 200)
    for (let k = 0; k < n; k += 1) names.push(randomText(20))
    const catalog = buildCatalog(names, [])
    if (catalog.total !== names.length) {
      throw new Error(`总数对不上：${catalog.total} vs ${names.length}`)
    }
  }
})

// ---------------------------------------------------------------------------
// 6. 逃生门：ALWAYS_ALLOW 里的工具永远不能被任何阶段拒绝
// ---------------------------------------------------------------------------
await test('fuzz：逃生门在随机阶段表下也不会被锁死', async () => {
  const { decideOutOfStage } = await import('../lib/classify.js')
  for (let i = 0; i < 300; i += 1) {
    const stageName = 'st'
    const allow = []
    const n = Math.floor(rnd() * 5)
    for (let k = 0; k < n; k += 1) allow.push(randomText(8))
    const stages = { [stageName]: { allow, strict: rnd() < 0.5 } }
    const claimed = claimedTags(stages)
    for (const tool of ALWAYS_ALLOW) {
      const v = decideOutOfStage({ toolName: tool, stage: stageName, stages, claimed })
      if (!v.allow) {
        throw new Error(`逃生门被锁死（第 ${i} 次）：${tool} 在 stages=${JSON.stringify(stages)} 下被拒`)
      }
    }
  }
})

// ---------------------------------------------------------------------------
// 7. 成本估算：无损 JSON，且 payback 要么是有限数要么是 null
// ---------------------------------------------------------------------------
await test('fuzz：成本估算永远返回无损 JSON，payback 不会是 NaN/Infinity', () => {
  const cases = [
    [0, 0], [1, 1], [1e9, 1e9], [0, 1e9], [1e9, 0],
    [Number.MAX_SAFE_INTEGER, 1000], [-5, -5], [NaN, NaN], [Infinity, 0],
  ]
  for (const [ctx, bytes] of cases) {
    const e = estimateSwitchEconomy({ contextTokens: ctx, deniedBytes: bytes })
    const round = JSON.parse(JSON.stringify(e))
    if (JSON.stringify(round) !== JSON.stringify(e)) {
      throw new Error(`不是无损 JSON：ctx=${ctx} bytes=${bytes} → ${JSON.stringify(e)}`)
    }
    for (const key of ['costTokens', 'savePerTurnTokens']) {
      if (!Number.isFinite(e[key])) throw new Error(`${key} 不是有限数：${e[key]}（ctx=${ctx} bytes=${bytes}）`)
    }
    if (e.paybackTurns !== null && !Number.isFinite(e.paybackTurns)) {
      throw new Error(`paybackTurns 既不是有限数也不是 null：${e.paybackTurns}`)
    }
    const verdict = decideByEconomy({ economy: e, maxPaybackTurns: 3 })
    if (typeof verdict.allow !== 'boolean') throw new Error('allow 必须是布尔值')
  }
})

// ---------------------------------------------------------------------------
// 8. 仲裁器：随机时间戳序列下不变量
// ---------------------------------------------------------------------------
await test('fuzz：仲裁器在随机时间序列下永不清空成负数或抛出', () => {
  for (let i = 0; i < 200; i += 1) {
    const arbiter = createSwitchArbiter({
      confirmations: 1 + Math.floor(rnd() * 3),
      cooldownMs: Math.floor(rnd() * 5000),
      confirmWindowMs: Math.floor(rnd() * 5000),
    })
    let now = 0
    for (let k = 0; k < 30; k += 1) {
      now += Math.floor(rnd() * 2000)
      const decision = arbiter.decide({
        key: 'k',
        detected: rnd() < 0.5 ? 'a' : 'b',
        explicit: rnd() < 0.2,
        now,
      })
      if (typeof decision.switch !== 'boolean') throw new Error('switch 必须是布尔值')
      if (!Number.isFinite(decision.pendingCount) || decision.pendingCount < 0) {
        throw new Error(`pendingCount 异常：${decision.pendingCount}`)
      }
      if (decision.switch) arbiter.noteSwitched({ key: 'k', now })
    }
    const snap = arbiter.snapshot('k')
    if (snap.pendingCount < 0) throw new Error('快照里 pendingCount 不该是负数')
  }
})

run()
