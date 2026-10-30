/**
 * ============================================================================
 * dsh-minimal-guard —— DSH 最小错误拦截器（熔断器）
 * ============================================================================
 *
 * 【这个插件干什么】
 *   1. 盯着 AI 每一次"工具调用"（读文件、跑命令、调 Unity……）的结果；
 *   2. 如果连续失败，就在第 N 次（默认 3 次）时"熔断"；
 *   3. 熔断后，AI 再想调用任何工具都会被拦下来，并且收到一段中文硬指令：
 *      "别再试了，把错误原文汇报给用户"；
 *   4. 用户发一条新消息，或者 AI 调 guard_reset，熔断自动解除。
 *
 * 【为什么这样设计能保证 DSH 不崩】
 *   - 全部逻辑是同步的、O(1) 的：没有循环遍历大数组、没有 while、没有定时器、
 *     没有网络请求、没有文件读写。所以不可能卡死主进程的事件循环。
 *   - 每一个监听器内部都包了 try/catch，插件自己的 bug 绝不会抛给 DSH 的
 *     工具调度器（否则会污染其他工具的正常执行）。
 *   - 所有注册都通过 ctx.effect(...) 或 ctx.on(...)，插件被禁用时自动注销干净，
 *     不会留下"野监听器"。
 *   - 状态只存在内存里，并且有上限（MAX_SESSIONS），不会越跑越占内存。
 *
 * 【以后要改东西，只改下面这个 CONFIG_DEFAULTS 区域就够了】
 * ============================================================================
 */

// 【修改这里：插件在插件管理器里显示的名字】
export const name = 'minimal-guard'

// 【修改这里：声明本插件依赖的 DSH 服务，tools 是工具注册表】
// 不要随便加，加了不存在的服务会导致插件加载失败。
export const inject = ['tools']

// ============================================================================
// 默认配置区 —— 90% 的日常调整都在这里
// ============================================================================
const CONFIG_DEFAULTS = {
  // 【修改这里】连续报错几次触发熔断。把 3 改成你想要的数字（建议 2~5）
  maxConsecutiveErrors: 3,

  // 【修改这里】总开关。false = 只记录、不拦截（调试用）
  enabled: true,

  // 【修改这里】哪些工具不参与"计数"。
  // guard_status / guard_reset 是本插件自己的工具，不能算进错误次数，
  // 否则 AI 一查状态就把计数清零了（等于给 AI 开外挂）。
  countIgnoreTools: ['guard_status', 'guard_reset'],

  // 【修改这里】逃生通道：这些工具即使熔断了也永远放行。
  // 这是"防自杀"设计——熔断后必须还能靠 guard_reset 解除，否则会话会被锁死。
  // route_* 是路由器（dsh-minimal-router）的逃生门，必须一起放行，
  // 否则熔断时连"切换阶段"都做不到，两个插件会互相锁死。
  exemptTools: ['guard_status', 'guard_reset', 'route_stage', 'route_status', 'route_reset', 'route_init'],

  // 【修改这里】只监控这些工具；填 [] = 监控全部工具。
  // 例：['unity_compile_wait', 'edit'] 只在这两个工具连续失败时熔断。
  watchedTools: [],

  // 【修改这里】错误提示最多保留多少个字符（防止把超长报错塞进上下文烧 token）
  maxMessageChars: 400,

  // 【修改这里】最多同时记住多少个会话的错误状态（内存安全上限）
  maxSessions: 200,
}

// ============================================================================
// 小工具函数（都是纯函数，方便测试）
// ============================================================================

/** 把用户/配置文件里的值夹到合法范围，非法值一律回退默认值。 */
function clampInt(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const i = Math.trunc(n)
  if (i < min || i > max) return fallback
  return i
}

/** 规范化配置：任何脏数据都不会让插件挂掉。 */
export function normalizeConfig(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const limit = clampInt(src.maxConsecutiveErrors, CONFIG_DEFAULTS.maxConsecutiveErrors, 1, 100)
  return {
    maxConsecutiveErrors: limit,
    enabled: src.enabled !== false,
    countIgnoreTools: Array.isArray(src.countIgnoreTools) ? src.countIgnoreTools.filter((x) => typeof x === 'string') : [...CONFIG_DEFAULTS.countIgnoreTools],
    exemptTools: Array.isArray(src.exemptTools) ? src.exemptTools.filter((x) => typeof x === 'string') : [...CONFIG_DEFAULTS.exemptTools],
    watchedTools: Array.isArray(src.watchedTools) ? src.watchedTools.filter((x) => typeof x === 'string') : [],
    maxMessageChars: clampInt(src.maxMessageChars, CONFIG_DEFAULTS.maxMessageChars, 40, 4000),
    maxSessions: clampInt(src.maxSessions, CONFIG_DEFAULTS.maxSessions, 1, 5000),
  }
}

/** 从一次工具调用里取工具名；取不到就返回空串（绝不抛错）。 */
export function toolNameOf(exec) {
  if (!exec || typeof exec !== 'object') return ''
  if (typeof exec.name === 'string') return exec.name
  if (exec.tool && typeof exec.tool.name === 'string') return exec.tool.name
  return ''
}

/** 从一次工具调用里取会话 id；取不到就用 '__global__'（这样不会互相干扰）。 */
export function keyOf(execOrAgent) {
  if (!execOrAgent || typeof execOrAgent !== 'object') return '__global__'
  const agent = execOrAgent.agent && typeof execOrAgent.agent === 'object' ? execOrAgent.agent : execOrAgent
  if (typeof agent.id === 'string' && agent.id) return agent.id
  return '__global__'
}

/** 判断一次工具调用是不是"失败的"（DSH 的失败结果 isError === true）。 */
export function isErrorResult(result) {
  if (!result || typeof result !== 'object') return false
  return result.isError === true
}

/** 从失败结果里抽出人能看的错误文字。 */
export function errorMessageOf(result, maxChars = 400) {
  if (!result || typeof result !== 'object') return ''
  let text = ''
  if (result.error && typeof result.error === 'object') {
    if (typeof result.error.message === 'string') text = result.error.message
    if (result.error.info && typeof result.error.info === 'object' && typeof result.error.info.code === 'string') {
      text = text ? `${result.error.info.code}: ${text}` : result.error.info.code
    }
  } else if (typeof result.error === 'string') {
    text = result.error
  } else if (Array.isArray(result.content)) {
    // 有些失败结果把文字放在 content 里
    for (const block of result.content) {
      if (block && block.type === 'text' && typeof block.text === 'string') {
        text = text ? `${text} ${block.text}` : block.text
      }
    }
  }
  return clip(text, maxChars)
}

/** 截断字符串，永远返回字符串（不返回 undefined，保证返回值是无损 JSON）。 */
export function clip(text, maxChars) {
  const s = typeof text === 'string' ? text : ''
  if (s.length <= maxChars) return s
  return `${s.slice(0, maxChars)}…(已截断)`
}

// ============================================================================
// 核心状态机（纯逻辑，不碰 ctx，所以可以单独测试）
// ============================================================================
export function createBreaker(config = {}) {
  const cfg = normalizeConfig(config)

  // key: sessionId，value: 该会话的错误状态
  const states = new Map()

  function stateFor(key) {
    let s = states.get(key)
    if (s) return s
    s = {
      consecutive: 0, // 当前连续错误次数
      total: 0, // 本次会话累计错误次数（不清零，仅用于展示）
      tripped: false, // 是否已熔断
      lastTool: '', // 最近一次出错的工具名
      lastError: '', // 最近一次错误文字
      lastAt: 0, // 最近一次出错的时间戳
      trips: 0, // 熔断触发次数
    }
    states.set(key, s)
    // 内存安全：超过上限就丢掉最早的那个会话
    if (states.size > cfg.maxSessions) {
      const oldest = states.keys().next().value
      if (oldest !== undefined && oldest !== key) states.delete(oldest)
    }
    return s
  }

  function reset(key) {
    const s = states.get(key)
    if (!s) return false
    s.consecutive = 0
    s.tripped = false
    return true
  }

  /**
   * 记录一次工具调用的结果。
   * @returns {{consecutive:number, tripped:boolean, justTripped:boolean}}
   */
  function observe(key, tool, failed, message) {
    // 只监控白名单里的工具时，名单外的工具一律不记账
    if (cfg.watchedTools.length > 0 && tool && !cfg.watchedTools.includes(tool)) {
      const skipped = stateFor(key)
      return { consecutive: skipped.consecutive, tripped: skipped.tripped, justTripped: false }
    }
    // 不参与计数的工具：直接忽略，既不加也不减
    if (tool && cfg.countIgnoreTools.includes(tool)) {
      const s = stateFor(key)
      return { consecutive: s.consecutive, tripped: s.tripped, justTripped: false }
    }
    const s = stateFor(key)
    if (!failed) {
      // 成功一次 → 连续计数清零（"连续"的含义就在这里）
      s.consecutive = 0
      return { consecutive: 0, tripped: s.tripped, justTripped: false }
    }
    // 这次失败是本插件自己拦下来的（不是 AI 又犯错）→ 不重复计数
    if (typeof message === 'string' && message.startsWith(TRIP_MARKER)) {
      return { consecutive: s.consecutive, tripped: s.tripped, justTripped: false }
    }
    s.consecutive += 1
    s.total += 1
    s.lastTool = tool || '(未知工具)'
    s.lastError = clip(message, cfg.maxMessageChars)
    s.lastAt = Date.now()
    let justTripped = false
    if (!s.tripped && s.consecutive >= cfg.maxConsecutiveErrors) {
      s.tripped = true
      s.trips += 1
      justTripped = true
    }
    return { consecutive: s.consecutive, tripped: s.tripped, justTripped }
  }

  /** 熔断时给 AI 看的硬指令（英文：模型会读它）。 */
  function tripNotice(s) {
    const lines = [
      '[dsh-minimal-guard] circuit breaker tripped',
      `${s.consecutive} consecutive tool calls failed; further tool calls are stopped.`,
      s.lastTool ? `last failure: ${s.lastTool}` : '',
      s.lastError ? `error: ${s.lastError}` : '',
      'Stop retrying now. Report the error above to the user verbatim, say what you plan to change, and do not retry with the same arguments.',
      'To lift it: call guard_reset, or have the user send a new message (the counter resets automatically).',
    ]
    return lines.filter(Boolean).join('\n')
  }

  // 【修改这里】熔断提示的固定开头，用来识别"这次失败是我们自己拦的，不是 AI 又犯错"
  const TRIP_MARKER = '[dsh-minimal-guard] circuit breaker tripped'

  /**
   * 拦截判断：返回字符串 = 拒绝这次工具调用；返回 undefined = 放行。
   */
  function decidePre(exec) {
    if (!cfg.enabled) return undefined
    const tool = toolNameOf(exec)
    if (tool && cfg.exemptTools.includes(tool)) return undefined // 逃生通道
    if (cfg.watchedTools.length > 0 && !cfg.watchedTools.includes(tool)) return undefined
    const s = states.get(keyOf(exec))
    if (!s || !s.tripped) return undefined
    return tripNotice(s)
  }

  /** 给 guard_status 用的只读快照（保证是无损 JSON：没有 undefined 字段）。 */
  function status(key) {
    const s = states.get(key)
    return {
      enabled: cfg.enabled,
      maxConsecutiveErrors: cfg.maxConsecutiveErrors,
      trackedSessions: states.size,
      session: {
        consecutiveErrors: s ? s.consecutive : 0,
        totalErrors: s ? s.total : 0,
        tripped: s ? s.tripped : false,
        trips: s ? s.trips : 0,
        lastTool: s ? s.lastTool : '',
        lastError: s ? s.lastError : '',
        lastErrorAt: s ? s.lastAt : 0,
      },
    }
  }

  return { config: cfg, observe, reset, decidePre, status, stateFor, states }
}

// ============================================================================
// 工具返回值的渲染方式（DSH 要求每个工具声明 output）
// ============================================================================
const RENDER = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

// ============================================================================
// 插件入口：DSH 加载插件时调用这个函数
// ============================================================================
export function applyGuard(ctx, config = {}) {
  const breaker = createBreaker(config)

  // ------------------------------------------------------------------
  // 工具 1：guard_status —— 查看当前错误计数（只读，永远放行）
  // ------------------------------------------------------------------
  ctx.effect(() =>
    ctx.tools.register({
      name: 'guard_status',
      description:
        'Read the circuit breaker state: consecutive error count, whether it has tripped, and the last error. Read-only, changes nothing.',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: RENDER,
      async execute(_args, exec) {
        try {
          return breaker.status(keyOf(exec))
        } catch {
          return { enabled: false, maxConsecutiveErrors: 0, trackedSessions: 0, session: null }
        }
      },
    }),
  )

  // ------------------------------------------------------------------
  // 工具 2：guard_reset —— 清零并解除熔断（逃生通道）
  // ------------------------------------------------------------------
  ctx.effect(() =>
    ctx.tools.register({
      name: 'guard_reset',
      description:
        'Clear this session\'s consecutive error count and lift the breaker so work can continue. Call it when the user says "continue" or "try again".',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: RENDER,
      async execute(_args, exec) {
        const key = keyOf(exec)
        try {
          const before = breaker.status(key)
          breaker.reset(key)
          return { reset: true, previous: before.session, message: '已清零并解除熔断，可以继续。' }
        } catch {
          return { reset: false, previous: null, message: '重置时发生内部错误，请重新发一条消息。' }
        }
      },
    }),
  )

  // ------------------------------------------------------------------
  // 监听 1：每次工具执行完，记账（成功→清零，失败→+1）
  // ------------------------------------------------------------------
  ctx.on('tools/result', (exec, result) => {
    try {
      const key = keyOf(exec)
      const tool = toolNameOf(exec)
      const failed = isErrorResult(result)
      const message = failed ? errorMessageOf(result, breaker.config.maxMessageChars) : ''
      const snap = breaker.observe(key, tool, failed, message)
      if (snap.justTripped) {
        // 只在控制台吱一声，方便排查；不影响任何业务流程
        console.warn(`[minimal-guard] 熔断触发：${tool} 连续失败 ${snap.consecutive} 次`)
      }
    } catch {
      // 【重要】这里绝不向外抛错，否则会打断 DSH 的工具结果处理链
    }
  })

  // ------------------------------------------------------------------
  // 监听 2：工具执行前，如果已熔断就拒绝
  // ------------------------------------------------------------------
  ctx.on('tools/pre-execute', (...args) => {
    const next = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null
    const exec = args[0]
    try {
      const reason = breaker.decidePre(exec)
      if (reason) return { kind: 'deny', reason }
    } catch {
      // 插件自己算错了 → 放行，宁可少拦一次也不能堵死用户
    }
    return next ? next() : { kind: 'allow' }
  })

  // ------------------------------------------------------------------
  // 监听 3：用户发新消息（新一轮开始）→ 自动清零
  // ------------------------------------------------------------------
  ctx.on('agent/inbox/claimed', (payload) => {
    try {
      if (payload && payload.agent) breaker.reset(keyOf(payload.agent))
    } catch {
      // 同上：静默
    }
  })
}
