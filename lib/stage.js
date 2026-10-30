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
  function setStage(key, stage) {
    if (!stages[stage]) return { ok: false, error: `未知阶段：${stage}。可用：${Object.keys(stages).join(', ')}` }
    const s = stateFor(key)
    s.stage = stage
    s.explicit = true
    s.by = 'explicit'
    s.matched = ''
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

  return { stages, defaultStage: fallback, onUserMessage, setStage, reset, get, list, states }
}
