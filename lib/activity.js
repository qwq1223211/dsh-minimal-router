/**
 * ============================================================================
 * dsh-minimal-router · lib/activity.js
 * ============================================================================
 * 「活动日志」——记录插件**实际做过什么**，而不是此刻是什么状态。
 *
 * route_status 回答的是"现在哪个阶段、砍了几个工具"；
 * 这份日志回答的是"刚才那 20 分钟，它拦了谁、切了几次、开了什么"。
 *
 * 【为什么需要】
 *   用户最大的疑惑不是"现在是什么"，而是"它到底干了没干"。
 *   尤其当某个工具莫名被拒、或者某个阶段自己变了，没有日志就只能靠猜。
 *
 * 【为什么只留最近 200 条】
 *   这是诊断用的，不是审计系统。留太多会变成又一个"每轮都要读"的负担。
 *   落盘用 JSONL，读的时候只取尾部 N 行 —— 文件再大也不会拖慢启动。
 *
 * 【写盘原则】
 *   尽力而为：任何一次写失败都只影响这条日志，绝不影响主流程。
 * ============================================================================
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

const KINDS = Object.freeze([
  'switch', // 阶段切换
  'restrict', // 应用/解除工具限制
  'deny', // 拦截了一次工具调用
  'block', // 闸门拦下了一次切换（上下文/成本）
  'grant', // route_use 收窄
  'reset', // route_reset
  'degrade', // 模型降级
])

/**
 * @param {{file?:string, limit?:number, maxFileLines?:number, now?:()=>number}} [options]
 */
export function createActivityLog(options = {}) {
  const file = typeof options.file === 'string' && options.file ? options.file : ''
  const limit = Number.isFinite(options.limit) ? Math.max(10, Math.trunc(options.limit)) : 200
  const maxFileLines = Number.isFinite(options.maxFileLines) ? Math.trunc(options.maxFileLines) : 2000
  const now = typeof options.now === 'function' ? options.now : Date.now

  /** @type {{t:number, kind:string, [k:string]:any}[]} 旧 → 新 */
  const events = []

  // ---- 载入历史（只取尾部，坏行直接跳过） ----
  if (file) {
    try {
      const raw = readFileSync(file, 'utf8')
      const lines = raw.split('\n').filter(Boolean)
      for (const line of lines.slice(-limit)) {
        try {
          const ev = JSON.parse(line)
          if (ev && typeof ev === 'object' && typeof ev.kind === 'string') events.push(ev)
        } catch {
          // 单行坏了不影响其它行
        }
      }
    } catch {
      // 文件不存在就空着
    }
  }

  function trim() {
    if (events.length > limit) events.splice(0, events.length - limit)
  }

  function persist(ev) {
    if (!file) return
    try {
      mkdirSync(dirname(file), { recursive: true })
      // 文件太大就整体重写成尾部，避免无限膨胀
      let size = 0
      try {
        size = statSync(file).size
      } catch {
        size = 0
      }
      if (size > 256 * 1024) {
        writeFileSync(file, events.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8')
      } else {
        appendFileSync(file, `${JSON.stringify(ev)}\n`, 'utf8')
      }
    } catch {
      // 写不进去只影响这条日志
    }
  }

  /**
   * 记一条活动。
   * @param {string} kind 见 KINDS
   * @param {object} [data] 附加字段（尽量短：from/to/count/tool/reason）
   */
  function log(kind, data = {}) {
    const k = typeof kind === 'string' ? kind : ''
    if (!k) return
    const ev = { t: now(), kind: k }
    for (const [key, v] of Object.entries(data || {})) {
      if (v === undefined || v === null || v === '') continue
      if (typeof v === 'string' && v.length > 120) ev[key] = `${v.slice(0, 117)}...`
      else if (typeof v === 'object') continue // 只存标量，日志要小
      else ev[key] = v
    }
    events.push(ev)
    trim()
    persist(ev)
  }

  /** 最近 n 条，最新在前 */
  function recent(n = 20, kind = '') {
    const count = Number.isFinite(n) ? Math.max(1, Math.min(200, Math.trunc(n))) : 20
    const want = typeof kind === 'string' ? kind.trim() : ''
    const pool = want ? events.filter((e) => e.kind === want) : events
    return pool.slice(-count).reverse().map((e) => ({ ...e }))
  }

  /** 频次汇总：一眼看出"它到底拦了多少" */
  function summary(sinceMs = 0) {
    const cutoff = sinceMs > 0 ? now() - sinceMs : 0
    const counts = {}
    let total = 0
    for (const e of events) {
      if (e.t < cutoff) continue
      counts[e.kind] = (counts[e.kind] || 0) + 1
      total += 1
    }
    const parts = KINDS.filter((k) => counts[k]).map((k) => `${label(k)} ${counts[k]} 次`)
    return {
      total,
      counts,
      text: total === 0 ? '还没有任何活动记录' : `最近共 ${total} 条：${parts.join(' · ')}`,
    }
  }

  function clear() {
    events.length = 0
    if (file) {
      try {
        writeFileSync(file, '', 'utf8')
      } catch {
        // 静默
      }
    }
  }

  return { log, recent, summary, clear, kinds: KINDS, _all: () => events.map((e) => ({ ...e })) }
}

function label(kind) {
  switch (kind) {
    case 'switch':
      return '切阶段'
    case 'restrict':
      return '改工具表'
    case 'deny':
      return '拦截调用'
    case 'block':
      return '闸门拦截'
    case 'grant':
      return '临时收窄'
    case 'reset':
      return '复位'
    case 'degrade':
      return '降级'
    default:
      return kind
  }
}
