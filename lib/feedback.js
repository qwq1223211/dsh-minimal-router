/**
 * ============================================================================
 * dsh-minimal-router · lib/feedback.js
 * ============================================================================
 * 两件"反馈"的事，都是按会话隔离的内存状态：
 *
 *   1. 建议（suggestion）：语义分"差一点"时记一句，让尾部提示多一行
 *      —— 只影响提示文案，绝不改工具表
 *
 *   2. 拦截回收（deny recovery）：被拦之后，模型有没有在 2 分钟内换个工具继续干
 *      —— 这是判断"拦截阈值是不是太严"的唯一客观依据
 *
 * 为什么放内存：这两个都是"当下这个会话"的诊断数据，
 * 落盘的价值不如活动日志（那边已经记了 deny 事件本身）。
 * ============================================================================
 */

const RECOVER_WINDOW_MS = 120000

export function createFeedback(options = {}) {
  const windowMs = Number.isFinite(options.windowMs) ? Math.max(1000, options.windowMs) : RECOVER_WINDOW_MS
  const now = typeof options.now === 'function' ? options.now : Date.now

  /** @type {Map<string, {stage:string, tag:string, score:number, at:number}>} */
  const suggestions = new Map()
  /** @type {Map<string, {denied:number, recovered:number, lastAt:number}>} */
  const stats = new Map()

  function setSuggestion(key, value) {
    if (!key || !value || !value.stage || !value.tag) return
    suggestions.set(key, { ...value, at: now() })
  }

  function getSuggestion(key, maxAgeMs = 5 * 60 * 1000) {
    const s = suggestions.get(key)
    if (!s) return null
    if (now() - s.at > maxAgeMs) {
      suggestions.delete(key)
      return null
    }
    return s
  }

  function clearSuggestion(key) {
    suggestions.delete(key)
  }

  function noteDeny(key) {
    if (!key) return
    const s = stats.get(key) || { denied: 0, recovered: 0, lastAt: 0 }
    s.denied += 1
    s.lastAt = now()
    stats.set(key, s)
  }

  function noteRecover(key) {
    if (!key) return
    const s = stats.get(key)
    if (!s || !s.lastAt) return
    if (now() - s.lastAt > windowMs) {
      s.lastAt = 0
      return
    }
    s.recovered += 1
    s.lastAt = 0
  }

  function summary(key) {
    const s = stats.get(key) || { denied: 0, recovered: 0 }
    const rate = s.denied ? Number((s.recovered / s.denied).toFixed(2)) : null
    let note = '还没拦过'
    if (s.denied) {
      note =
        rate !== null && rate >= 0.6
          ? '拦截后多数能自己换路，阈值合适'
          : '拦截后经常放弃，提示文案可能需要更具体'
    }
    return { denied: s.denied, recovered: s.recovered, rate, note }
  }

  return { setSuggestion, getSuggestion, clearSuggestion, noteDeny, noteRecover, summary }
}
