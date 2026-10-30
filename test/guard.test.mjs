/**
 * dsh-minimal-guard 的自测脚本（不需要安装到 DSH 就能跑）
 *
 * 跑法：node test/guard.test.mjs
 *
 * 它做两件事：
 *   1. 用一个"假的 DSH"（模拟 tools/result、tools/pre-execute 事件）把插件跑一遍；
 *   2. 断言每一个行为都符合预期，最后打印 PASS / FAIL 汇总。
 *
 * 【以后改完 index.js，第一件事就是回来跑这个脚本】
 */

import {
   applyGuard as apply,
  createBreaker,
  normalizeConfig,
  keyOf,
  toolNameOf,
  isErrorResult,
} from '../lib/guard.js'

// ============================================================================
// 微型测试框架（绿色的 PASS / 红色的 FAIL）
// ============================================================================
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

// ============================================================================
// 假的 DSH 运行时：模拟事件总线 + 工具注册表 + 一次完整的工具调用
// ============================================================================
function createFakeRuntime(pluginConfig) {
  const listeners = new Map() // 事件名 -> [监听器]
  const tools = new Map() // 工具名 -> 定义
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
      return () => {
        const idx = list.indexOf(listener)
        if (idx >= 0) list.splice(idx, 1)
      }
    },
    tools: {
      register(definition) {
        if (tools.has(definition.name)) throw new Error(`工具重名：${definition.name}`)
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
  }

  // 真正加载插件
  apply(ctx, pluginConfig)

  const agent = { id: 'session-A' }

  function emit(eventName, ...args) {
    const list = listeners.get(eventName) || []
    for (const listener of list) listener(...args)
  }

  /** 模拟 DSH 的 tools/pre-execute 瀑布流（支持多个监听器串联 next） */
  function preExecute(exec) {
    const list = listeners.get('tools/pre-execute') || []
    let cursor = 0
    const next = () => {
      const listener = list[cursor]
      cursor += 1
      if (!listener) return Promise.resolve({ kind: 'allow' })
      return Promise.resolve(listener(exec, next))
    }
    return next()
  }

  /**
   * 跑一次完整的工具调用：
   * pre-execute（可能被拒）→ 执行 → tools/result 记账
   */
  async function callTool(toolName, outcome, sessionId = 'session-A') {
    const exec = { name: toolName, arguments: {}, agent: { id: sessionId }, signal: new AbortController().signal }

    const decision = await preExecute(exec)
    if (decision && decision.kind === 'deny') {
      return { blocked: true, reason: decision.reason || '' }
    }

    const result =
      outcome === 'error'
        ? { isError: true, error: { message: `BOOM: ${toolName} failed`, info: { name: 'Test', code: 'E_TEST' } }, content: [] }
        : { isError: false, value: { ok: true }, content: [{ type: 'text', text: 'ok' }] }

    emit('tools/result', exec, result)
    return { blocked: false, result }
  }

  return { ctx, agent, tools, listeners, disposers, emit, preExecute, callTool }
}

/** 让 AI "连续失败 n 次"，返回最后一次的调用结果 */
async function failTimes(runtime, n, toolName = 'edit', sessionId = 'session-A') {
  let last = null
  for (let i = 0; i < n; i += 1) {
    last = await runtime.callTool(toolName, 'error', sessionId)
  }
  return last
}

// ============================================================================
// 测试开始
// ============================================================================
console.log(`\n${BOLD}dsh-minimal-guard · 自测套件${RESET}\n`)

// --- 1. 配置 ---------------------------------------------------------------
await test('配置：默认熔断阈值是 3 次', () => {
  assertEqual(normalizeConfig({}).maxConsecutiveErrors, 3)
})

await test('配置：把阈值改成 5 会生效', () => {
  assertEqual(normalizeConfig({ maxConsecutiveErrors: 5 }).maxConsecutiveErrors, 5)
})

await test('配置：脏数据（0 / 负数 / 字符串）自动回退为 3，不会崩', () => {
  assertEqual(normalizeConfig({ maxConsecutiveErrors: 0 }).maxConsecutiveErrors, 3)
  assertEqual(normalizeConfig({ maxConsecutiveErrors: -9 }).maxConsecutiveErrors, 3)
  assertEqual(normalizeConfig({ maxConsecutiveErrors: 'abc' }).maxConsecutiveErrors, 3)
})

// --- 2. 计数 ---------------------------------------------------------------
await test('连续 1 次失败：只计数，不熔断', async () => {
  const rt = createFakeRuntime({})
  const r = await failTimes(rt, 1)
  assertEqual(r.blocked, false, '第 1 次不应该被拦')
  const status = await rt.tools.get('guard_status').execute({}, { agent: rt.agent })
  assertEqual(status.session.consecutiveErrors, 1)
  assertEqual(status.session.tripped, false)
})

await test('连续 2 次失败：还没到 3 次，仍然放行', async () => {
  const rt = createFakeRuntime({})
  await failTimes(rt, 2)
  const status = await rt.tools.get('guard_status').execute({}, { agent: rt.agent })
  assertEqual(status.session.consecutiveErrors, 2)
  assertEqual(status.session.tripped, false)
})

await test('连续 3 次失败：触发熔断（默认红线）', async () => {
  const rt = createFakeRuntime({})
  await failTimes(rt, 3)
  const status = await rt.tools.get('guard_status').execute({}, { agent: rt.agent })
  assertEqual(status.session.consecutiveErrors, 3)
  assertEqual(status.session.tripped, true, '第 3 次失败后必须熔断')
  assertEqual(status.session.trips, 1)
})

// --- 3. 拦截 ---------------------------------------------------------------
await test('熔断后第 4 次工具调用被拒绝，且提示里带错误原文', async () => {
  const rt = createFakeRuntime({})
  await failTimes(rt, 3)
  const blocked = await rt.callTool('edit', 'error')
  assertEqual(blocked.blocked, true, '熔断后必须拦下来')
  assert(blocked.reason.includes('已熔断'), '提示里要有"已熔断"字样')
  assert(blocked.reason.includes('BOOM: edit failed'), '提示里要带最近一次错误原文')
  assert(blocked.reason.includes('汇报给用户'), '提示里要有"汇报给用户"的硬指令')
})

await test('熔断后连成功调用也一起拦住（彻底停下来）', async () => {
  const rt = createFakeRuntime({})
  await failTimes(rt, 3)
  const blocked = await rt.callTool('read', 'success')
  assertEqual(blocked.blocked, true, '熔断期间任何工具都不该放行')
})

await test('被自己拦下来的那次不算"新错误"（真实环境发现的 bug）', async () => {
  const rt = createFakeRuntime({})
  await failTimes(rt, 3)
  // 真实 DSH 里，被 deny 的调用也会走一次 tools/result（isError=true，内容就是熔断提示）
  rt.emit('tools/result', { name: 'read', agent: rt.agent }, {
    isError: true,
    error: { message: '【dsh-minimal-guard 已熔断】\n连续 3 次工具调用失败，已中止后续工具调用。' },
    content: [],
  })
  const status = await rt.tools.get('guard_status').execute({}, { agent: rt.agent })
  assertEqual(status.session.consecutiveErrors, 3, '拦截自己的提示不能把计数越堆越高')
})

// --- 4. 清零 ---------------------------------------------------------------
await test('中途成功一次 → 连续计数立刻清零（"连续"的含义）', async () => {
  const rt = createFakeRuntime({})
  await failTimes(rt, 2)
  await rt.callTool('read', 'success')
  let status = await rt.tools.get('guard_status').execute({}, { agent: rt.agent })
  assertEqual(status.session.consecutiveErrors, 0, '成功一次后应清零')
  assertEqual(status.session.tripped, false)

  await failTimes(rt, 2)
  status = await rt.tools.get('guard_status').execute({}, { agent: rt.agent })
  assertEqual(status.session.consecutiveErrors, 2, '清零后重新计数，2 次仍不熔断')
  assertEqual(status.session.tripped, false)
})

await test('guard_reset 能解除熔断，之后工具重新可用', async () => {
  const rt = createFakeRuntime({})
  await failTimes(rt, 3)
  const resetOut = await rt.tools.get('guard_reset').execute({}, { agent: rt.agent })
  assertEqual(resetOut.reset, true)
  const after = await rt.callTool('edit', 'success')
  assertEqual(after.blocked, false, '重置后必须可以继续调用工具')
})

await test('用户发新消息（新一轮对话）→ 自动清零', async () => {
  const rt = createFakeRuntime({})
  await failTimes(rt, 3)
  rt.emit('agent/inbox/claimed', { agent: rt.agent, message: { role: 'user' }, turn: 2 })
  const after = await rt.callTool('edit', 'success')
  assertEqual(after.blocked, false, '新一轮用户消息后应自动解除熔断')
})

// --- 5. 隔离与安全 ---------------------------------------------------------
await test('不同会话的错误计数互相隔离', async () => {
  const rt = createFakeRuntime({})
  await failTimes(rt, 3, 'edit', 'session-A')
  const other = await rt.callTool('edit', 'error', 'session-B')
  assertEqual(other.blocked, false, 'B 会话不该被 A 会话的熔断影响')
  const statusB = await rt.tools.get('guard_status').execute({}, { agent: { id: 'session-B' } })
  assertEqual(statusB.session.consecutiveErrors, 1)
})

await test('逃生通道：guard_status / guard_reset 永不被拦，也不参与计数', async () => {
  const rt = createFakeRuntime({})
  await failTimes(rt, 2)
  // 熔断期间查状态：放行，且不会把计数清零
  const statusCall = await rt.callTool('guard_status', 'success')
  assertEqual(statusCall.blocked, false, 'guard_status 必须永远放行')
  const status = await rt.tools.get('guard_status').execute({}, { agent: rt.agent })
  assertEqual(status.session.consecutiveErrors, 2, '查询状态不应该把计数清零')
})

await test('监听器签名兼容：只传 exec 不传 next 也不会崩', async () => {
  const rt = createFakeRuntime({})
  const listeners = rt.listeners.get('tools/pre-execute') || []
  assertEqual(listeners.length, 1, '应该注册了 1 个 pre-execute 监听器')
  const decision = await listeners[0]({ name: 'read', agent: { id: 'session-A' } })
  assertEqual(decision.kind, 'allow', '没有 next 时应返回 allow')
})

await test('脏数据不崩：null / 非对象 / 空错误信息都能扛住', async () => {
  const rt = createFakeRuntime({})
  rt.emit('tools/result', null, null)
  rt.emit('tools/result', { name: 'x', agent: rt.agent }, { isError: true })
  rt.emit('tools/result', { name: 'y', agent: rt.agent }, { isError: true, error: {} })
  rt.emit('agent/inbox/claimed', null)
  const status = await rt.tools.get('guard_status').execute({}, { agent: rt.agent })
  assertEqual(status.session.consecutiveErrors, 2, '空错误信息也要算一次错误')
  assertEqual(isErrorResult(null), false)
  assertEqual(toolNameOf(null), '')
  assertEqual(keyOf(null), '__global__')
})

await test('内存安全：会话状态超过上限会淘汰最旧的', async () => {
  const breaker = createBreaker({ maxSessions: 3 })
  for (let i = 0; i < 10; i += 1) breaker.observe(`s-${i}`, 'edit', true, 'x')
  assertEqual(breaker.states.size, 3, '最多只保留 3 个会话')
  assert(breaker.states.has('s-9'), '最新的会话必须还在')
})

await test('白名单模式：watchedTools 之外的工具失败不计数', async () => {
  const rt = createFakeRuntime({ watchedTools: ['unity_compile_wait'] })
  await failTimes(rt, 5, 'edit')
  let status = await rt.tools.get('guard_status').execute({}, { agent: rt.agent })
  assertEqual(status.session.consecutiveErrors, 0, 'edit 不在白名单，不该计数')
  await failTimes(rt, 3, 'unity_compile_wait')
  status = await rt.tools.get('guard_status').execute({}, { agent: rt.agent })
  assertEqual(status.session.tripped, true, '白名单里的工具连续 3 次失败应熔断')
})

await test('总开关 enabled=false：只记录，不拦截', async () => {
  const rt = createFakeRuntime({ enabled: false })
  await failTimes(rt, 3)
  const after = await rt.callTool('edit', 'error')
  assertEqual(after.blocked, false, '关掉开关后不应该拦截')
})

await test('返回值是无损 JSON：status 里没有 undefined 字段', async () => {
  const rt = createFakeRuntime({})
  await failTimes(rt, 1)
  const status = await rt.tools.get('guard_status').execute({}, { agent: rt.agent })
  const roundTrip = JSON.parse(JSON.stringify(status))
  assert(roundTrip.session !== null && roundTrip.session !== undefined, 'session 必须存在')
  assertEqual(JSON.stringify(roundTrip), JSON.stringify(status), '序列化前后必须完全一致')
  for (const value of Object.values(roundTrip.session)) {
    assert(value !== undefined && value !== null, 'session 字段不允许 undefined/null')
  }
})

await test('插件能正常加载：注册了 2 个工具 + 3 个监听器', () => {
  const rt = createFakeRuntime({})
  assertEqual(rt.tools.size, 2, '应该注册 guard_status 和 guard_reset')
  assert(rt.tools.has('guard_status'), '缺少 guard_status')
  assert(rt.tools.has('guard_reset'), '缺少 guard_reset')
  assertEqual((rt.listeners.get('tools/result') || []).length, 1)
  assertEqual((rt.listeners.get('tools/pre-execute') || []).length, 1)
  assertEqual((rt.listeners.get('agent/inbox/claimed') || []).length, 1)
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
