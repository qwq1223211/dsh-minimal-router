/**
 * ============================================================================
 * dsh-minimal-router · lib/stage.js
 * ============================================================================
 * 阶段状态机 + 关键词识别。
 *
 * 优先级（用户拍板）：显式工具 > 关键词 > 默认
 *   显式：AI 调 route_stage("unity-ui")
 *   关键词：用户消息里出现"界面/按钮"→ 自动进 unity-ui
 *   默认：都没命中 → auto（只提示、不拦截，零摩擦）
 *
 * 关键设计：阶段只在**用户发新消息**时重新判定。
 *   同一条消息里的多个步骤，阶段保持不变 —— 否则模型刚切到 unity-ui，
 *   下一次工具调用又被判定回 auto，拦截逻辑就会疯狂抖动。
 * ============================================================================
 */

/**
 * 从用户消息里提取纯文本（ContentBlock 数组 → 字符串）。
 * @param {unknown} message UserMessage
 * @returns {string}
 */
export function textOfMessage(message) {
  if (!message || typeof message !== 'object') return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string') text += `${block.text}\n`
  }
  if (typeof message.text === 'string') text += message.text
  return text
}

/**
 * 关键词是否命中。
 *
 * 【坑】短英文关键词必须按"整词"匹配。
 * 之前用 includes('ui') 匹配，"uikit"、"build"、"quit" 全都会被误判成 UI 阶段——
 * 实测就发生过：一条提到 "uikit" 的消息把阶段错切成了 unity-ui。
 * 所以：纯 ASCII 关键词走词边界，含中文的关键词走子串匹配（中文没有空格分词）。
 *
 * @param {string} haystack 已转小写的消息文本
 * @param {string} needle 已转小写的关键词
 * @returns {boolean}
 */
export function keywordMatches(haystack, needle) {
  if (!needle) return false
  const ascii = /^[\x00-\x7F]+$/.test(needle)
  if (!ascii) return haystack.includes(needle)
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 前后不能紧邻字母数字，避免 ui 命中 uikit
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(haystack)
}

/**
 * 按关键词识别阶段。
 *
 * 判定规则：**配置顺序优先**（靠前的阶段先被检查），第一个命中的就是答案。
 * 为什么不用"最长关键词优先"：'unity' 这个词同时属于 unity-code 和 unity-ui，
 * 按长度会把"做个 Unity UI 界面"判成 unity-code（实测踩过）。
 * 按顺序就不会——只要把更具体的阶段（unity-ui）配在更宽泛的（unity-code）前面。
 *
 * @param {string} text
 * @param {Record<string, {keywords?: string[]}>} stages
 * @param {string[]} order 匹配顺序（靠前=优先）
 * @returns {string} 阶段名；没命中返回 ''
 */
export function detectStage(text, stages, order) {
  const haystack = typeof text === 'string' ? text.toLowerCase() : ''
  if (!haystack) return ''
  const table = stages && typeof stages === 'object' ? stages : {}
  const names = Array.isArray(order) && order.length > 0 ? order : Object.keys(table)

  for (const name of names) {
    if (name === 'auto') continue
    const definition = table[name]
    if (!definition) continue
    const keywords = Array.isArray(definition.keywords) ? definition.keywords : []
    for (const keyword of keywords) {
      const needle = typeof keyword === 'string' ? keyword.toLowerCase() : ''
      if (keywordMatches(haystack, needle)) return name
    }
  }
  return ''
}

/**
 * 会话级状态机。
 * @param {object} options
 * @param {Record<string, {allow?: string[], keywords?: string[]}>} options.stages
 * @param {string} options.defaultStage
 * @param {string[]} [options.order]
 * @param {number} [options.maxSessions]
 */
/**
 * 「显式切换」的说法。
 *
 * 为什么要区分：迟滞（要连续 N 次信号才切）如果一视同仁，
 * 那用户亲口说"切到 core 阶段"也得等两次，体验会很别扭。
 * 所以：显式命令 = 立刻生效；随口提到的关键词 = 需要累积确认。
 */
const EXPLICIT_SWITCH = /切到|切回|切换到|切换成|换到|换成|switch\s+to|switch\s+stage|go\s+to\s+stage/i

/**
 * 紧挨在切换词前面的否定词。
 *
 * 【真 bug 修这里】原来只做词匹配，于是：
 *   "别切到美术" / "不要切换到 art" / "先不切到 core"
 * 全部被当成**显式命令**——而显式命令会跳过迟滞和成本闸门，
 * 等于用户说一句"**别**切"，插件反而立刻去切，在最贵的会话里直接触发全价重建。
 */
const NEGATION_BEFORE = /(别|不要|不用|不必|不想|不需要|先不|暂不|请勿|禁止|not|don'?t|never|avoid)\s*$/i

/**
 * 这句话是不是在"明确要求切换阶段"？
 * 任何一处命中只要**不是**被否定的，就算显式命令。
 * @param {string} text
 * @returns {boolean}
 */
export function isExplicitSwitch(text) {
  const value = typeof text === 'string' ? text : ''
  if (!value) return false
  const scanner = new RegExp(EXPLICIT_SWITCH.source, 'gi')
  let match = scanner.exec(value)
  while (match) {
    const before = value.slice(Math.max(0, match.index - 8), match.index)
    if (!NEGATION_BEFORE.test(before)) return true
    match = scanner.exec(value)
  }
  return false
}

/**
 * 阶段切换仲裁器：给"切阶段"加迟滞和冷却。
 *
 * 【为什么需要】开着 enforceByRestrict 时，每次切阶段都可能触发一次前缀重建。
 * 实测同一动作的代价能从 3,205 token 飙到 513,857 token。
 * 而原逻辑是"关键词一命中就切"——用户在 Unity 代码任务里顺嘴提一句"界面"，
 * 就白付一次重建。这一层就是把这种"灵敏"压下去。
 *
 * 三条规则：
 *   1. 显式命令（"切到 X 阶段"，**否定句不算**）→ 立刻切，不等
 *   2. 随口提到的关键词 → 要连续 `confirmations` 次指向同一阶段才切（默认 2），
 *      且两次信号必须在 `confirmWindowMs` 之内，否则重新计数
 *   3. 刚切过一次 → `cooldownMs` 内不再自动切，只累计信号
 *
 * 【默认值从哪来】不是拍的，是从 88 次真实切换的时间间隔里量出来的
 * （见 _tools/analyze-switch-gaps.mjs）：
 *   间隔 P25 = 2.0s，中位数 = 9.0s，P75 = 81.1s，P90 = 433s
 *   43% 的相邻切换发生在 5 秒内、71% 在 60 秒内 —— 这就是"抖动"的量化证据。
 *   → 冷却取 60 秒：吃掉那 71% 的连抖，又不至于让真实的任务切换等太久。
 *   → 时间窗取 5 分钟（>P75）：让同一段对话里的连续提到能累加，
 *     十分钟后再提"贴图"则算新任务，重新从 1 数起。
 *
 * @param {{confirmations?:number, cooldownMs?:number, confirmWindowMs?:number, maxSessions?:number}} options
 */
export function createSwitchArbiter(options = {}) {
  const confirmations =
    Number.isFinite(Number(options.confirmations)) && Number(options.confirmations) >= 1
      ? Math.trunc(Number(options.confirmations))
      : 2
  const cooldownMs =
    Number.isFinite(Number(options.cooldownMs)) && Number(options.cooldownMs) >= 0
      ? Math.trunc(Number(options.cooldownMs))
      : 60000
  // 两次"关键词信号"相隔超过这个时间，就当成新任务，重新计数
  const confirmWindowMs =
    Number.isFinite(Number(options.confirmWindowMs)) && Number(options.confirmWindowMs) > 0
      ? Math.trunc(Number(options.confirmWindowMs))
      : 300000
  const maxSessions = Number.isFinite(Number(options.maxSessions)) ? Math.trunc(Number(options.maxSessions)) : 200

  const states = new Map()

  function stateFor(key) {
    let s = states.get(key)
    if (s) return s
    s = { pendingStage: '', pendingCount: 0, pendingAt: 0, lastSwitchAt: 0 }
    states.set(key, s)
    if (states.size > maxSessions) {
      const oldest = states.keys().next().value
      if (oldest !== undefined && oldest !== key) states.delete(oldest)
    }
    return s
  }

  /**
   * 决定这次要不要真的切。
   * @param {{key:string, detected:string, explicit:boolean, now?:number}} input
   * @returns {{switch:boolean, reason:string, pendingCount:number, need?:number, remainingMs?:number}}
   */
  function decide(input = {}) {
    const key = typeof input.key === 'string' ? input.key : '__global__'
    const detected = typeof input.detected === 'string' ? input.detected : ''
    const now = Number.isFinite(input.now) ? input.now : Date.now()
    const s = stateFor(key)

    if (!detected) return { switch: false, reason: 'no-signal', pendingCount: s.pendingCount }

    // 规则 1：显式命令，立刻切
    if (input.explicit === true) {
      return { switch: true, reason: 'explicit', pendingCount: s.pendingCount }
    }

    // 累计信号（换方向就重新数；隔太久也算新任务，重新数）
    const stale = confirmWindowMs > 0 && s.pendingAt > 0 && now - s.pendingAt > confirmWindowMs
    if (s.pendingStage !== detected || stale) {
      s.pendingStage = detected
      s.pendingCount = 1
    } else {
      s.pendingCount += 1
    }
    s.pendingAt = now

    // 规则 3：冷却期内只累计、不切
    if (cooldownMs > 0 && s.lastSwitchAt > 0) {
      const elapsed = now - s.lastSwitchAt
      if (elapsed < cooldownMs) {
        return { switch: false, reason: 'cooldown', pendingCount: s.pendingCount, remainingMs: cooldownMs - elapsed }
      }
    }

    // 规则 2：攒够了才切
    if (s.pendingCount >= confirmations) {
      return { switch: true, reason: 'confirmed', pendingCount: s.pendingCount, need: confirmations }
    }
    return { switch: false, reason: 'pending', pendingCount: s.pendingCount, need: confirmations }
  }

  /** 切完之后调用：清空待定信号，记下切换时间（冷却从此刻开始） */
  function noteSwitched(input = {}) {
    const key = typeof input.key === 'string' ? input.key : '__global__'
    const now = Number.isFinite(input.now) ? input.now : Date.now()
    const s = stateFor(key)
    s.pendingStage = ''
    s.pendingCount = 0
    s.pendingAt = 0
    s.lastSwitchAt = now
  }

  /** 某个会话的仲裁状态（给 route_status 看） */
  function snapshot(key) {
    const s = states.get(key)
    return {
      confirmations,
      cooldownMs,
      confirmWindowMs,
      pendingStage: s ? s.pendingStage : '',
      pendingCount: s ? s.pendingCount : 0,
      lastSwitchAt: s ? s.lastSwitchAt : 0,
    }
  }

  function reset(key) {
    return states.delete(key)
  }

  return { decide, noteSwitched, snapshot, reset, states, confirmations, cooldownMs }
}

export function createStageState(options = {}) {
  const stages = options.stages && typeof options.stages === 'object' ? options.stages : {}
  const fallback = typeof options.defaultStage === 'string' && options.defaultStage ? options.defaultStage : 'auto'
  const order = Array.isArray(options.order) ? options.order : Object.keys(stages)
  const maxSessions = Number.isFinite(options.maxSessions) ? options.maxSessions : 200

  // key → { stage, explicit, by, matched, initialized, at }
  const states = new Map()

  function stateFor(key) {
    let s = states.get(key)
    if (s) return s
    s = { stage: fallback, explicit: false, by: 'default', matched: '', initialized: false, at: Date.now() }
    states.set(key, s)
    if (states.size > maxSessions) {
      const oldest = states.keys().next().value
      if (oldest !== undefined && oldest !== key) states.delete(oldest)
    }
    return s
  }

  /**
   * 用户发新消息 → 重新判定（但不再无脑回落）。
   *
   * 【实测踩到的坑】最初的做法是"每条用户消息都重新判定，没命中就回默认"。
   * 结果：你说「切到 core 阶段」，下一句随便说点什么，阶段就回 auto，
   * 118 个工具的瘦身全部撤销 —— 等于每切一次只能用一轮，省的钱白丢。
   *
   * 现在的规则（才是真正的 显式 > 关键词 > 默认）：
   *   1. 有关键词命中 → 按关键词切（哪怕当前是显式阶段）
   *   2. 没命中 → **保持当前阶段不动**（首次除外，首次用默认值）
   *   3. 想回默认 → 显式 route_stage("auto") 或 route_reset()
   *
   * @param {string} key
   * @param {string} text 用户消息文本
   */
  function onUserMessage(key, text) {
    const s = stateFor(key)
    const detected = detectStage(text, stages, order)
    if (detected) {
      s.stage = detected
      s.explicit = false
      s.by = 'keyword'
      s.matched = detected
    } else if (!s.initialized) {
      // 这个会话第一次说话，且没命中关键词 → 用默认阶段
      s.stage = fallback
      s.explicit = false
      s.by = 'default'
      s.matched = ''
    } else {
      // 没命中 → 粘住，别动。（这是省 token 的关键：阶段不抖，工具表就不抖）
      s.by = s.explicit ? 'explicit' : 'sticky'
      s.matched = ''
    }
    s.initialized = true
    s.at = Date.now()
    return { ...s }
  }

  /** AI 显式切换 → 一直有效，直到关键词把它切走或用户复位 */
  function setStage(key, stage) {    if (!stages[stage]) return { ok: false, error: `未知阶段：${stage}。可用：${Object.keys(stages).join(', ')}` }
    const s = stateFor(key)
    s.stage = stage
    s.explicit = true
    s.by = 'explicit'
    s.matched = ''
    s.initialized = true
    s.at = Date.now()
    return { ok: true, stage }
  }

  /**
   * 语义路由专用：由调用方给出阶段，直接应用。
   * 与 onUserMessage 的区别：不再重新做关键词匹配；也不标记为 explicit。
   */
  function applyStage(key, stage, by = 'intent') {
    if (!stages[stage]) return { ok: false, error: `未知阶段：${stage}` }
    const s = stateFor(key)
    s.stage = stage
    s.explicit = false
    s.by = by
    s.matched = stage
    s.initialized = true
    s.at = Date.now()
    return { ok: true, stage }
  }

  /** 逃生门：复位 */
  function reset(key) {
    const s = stateFor(key)
    s.stage = fallback
    s.explicit = false
    s.by = 'default'
    s.matched = ''
    s.initialized = true
    s.at = Date.now()
    return true
  }

  function get(key) {
    return { ...stateFor(key) }
  }

  function list() {
    return [...states.entries()].map(([key, s]) => ({ key, ...s }))
  }

  return { stages, defaultStage: fallback, onUserMessage, setStage, applyStage, reset, get, list, states }
}
