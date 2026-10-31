/**
 * ============================================================================
 * dsh-minimal-router · lib/usage.js
 * ============================================================================
 * 「空转工具画像」——记录每个工具被真正调用过几次，找出从没用过的那些。
 *
 * 【为什么值得做】
 *   路由只能省"这一轮发出去的字节"，省不掉"你装了一个永远不用的插件"。
 *   而后者往往更贵：一个 500 行的 MCP 插件，可能 30 天一次都没被调用过，
 *   但它的工具声明每一轮都在发。
 *   所以这张画像的结论是：**这些工具从没被用过 → 那些插件可以卸了。**
 *
 * 【为什么不做成"自动卸载"】
 *   卸载插件是不可逆操作，而且跨会话/跨项目共享。插件只给建议，不替用户动手。
 *
 * 【持久化】
 *   写在用户目录（默认 ~/.dsh/minimal-router/tool-usage.json），不在包目录里。
 *   写盘是"尽力而为"：失败只影响统计，绝不影响主流程。
 * ============================================================================
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const VERSION = 1

/**
 * @param {{file?:string, flushMs?:number, now?:()=>number}} options
 */
export function createUsageTracker(options = {}) {
  const file = typeof options.file === 'string' && options.file ? options.file : ''
  const flushMs = Number.isFinite(options.flushMs) ? Math.max(0, options.flushMs) : 4000
  const now = typeof options.now === 'function' ? options.now : Date.now

  /** @type {Map<string, {c:number, first:number, last:number}>} */
  const tools = new Map()
  let lastFlush = 0
  let dirty = false

  // ---- 载入历史（坏了就当空） ----
  if (file) {
    try {
      const raw = readFileSync(file, 'utf8')
      const data = JSON.parse(raw)
      if (data && typeof data.tools === 'object' && data.tools) {
        for (const [name, v] of Object.entries(data.tools)) {
          if (typeof v === 'number') tools.set(name, { c: v, first: 0, last: 0 })
          else if (v && typeof v === 'object') {
            tools.set(name, {
              c: Number.isFinite(v.c) ? v.c : 0,
              first: Number.isFinite(v.first) ? v.first : 0,
              last: Number.isFinite(v.last) ? v.last : 0,
            })
          }
        }
      }
    } catch {
      // 文件不存在 / 坏了：从零开始
    }
  }

  function flush() {
    if (!file || !dirty) return
    try {
      mkdirSync(dirname(file), { recursive: true })
      const out = { v: VERSION, updatedAt: now(), tools: Object.fromEntries(tools) }
      writeFileSync(file, `${JSON.stringify(out)}\n`, 'utf8')
      dirty = false
      lastFlush = now()
    } catch {
      // 写不进去就算了，内存里还有
    }
  }

  /** 记一次真实调用 */
  function record(name) {
    const key = typeof name === 'string' ? name.trim() : ''
    if (!key) return
    const t = now()
    const cur = tools.get(key)
    if (cur) {
      cur.c += 1
      cur.last = t
      if (!cur.first) cur.first = t
    } else {
      tools.set(key, { c: 1, first: t, last: t })
    }
    dirty = true
    if (flushMs === 0 || t - lastFlush >= flushMs) flush()
  }

  /**
   * 生成画像。
   *
   * @param {string[]} registeredNames 当前注册表里的工具名
   * @param {(name:string)=>string} tagOf 工具名 → 组标签
   * @param {{maxGroups?:number, maxTop?:number}} [opts]
   */
  function summarize(registeredNames, tagOf, opts = {}) {
    const maxGroups = Number.isFinite(opts.maxGroups) ? opts.maxGroups : 8
    const maxTop = Number.isFinite(opts.maxTop) ? opts.maxTop : 6
    const names = Array.isArray(registeredNames) ? registeredNames.filter(Boolean) : []

    let unusedCount = 0
    const byTag = new Map()
    for (const name of names) {
      const used = tools.get(name)
      const tag = typeof tagOf === 'function' ? String(tagOf(name) || 'core') : 'core'
      const row = byTag.get(tag) || { tag, total: 0, unused: 0 }
      row.total += 1
      if (!used || !used.c) {
        row.unused += 1
        unusedCount += 1
      }
      byTag.set(tag, row)
    }

    const groups = [...byTag.values()]
      .filter((g) => g.unused > 0)
      .sort((a, b) => b.unused - a.unused)
      .slice(0, maxGroups)

    const top = [...tools.entries()]
      .filter(([, v]) => v.c > 0)
      .sort((a, b) => b[1].c - a[1].c)
      .slice(0, maxTop)
      .map(([name, v]) => ({ name, calls: v.c }))

    return {
      trackedTools: tools.size,
      registeredTools: names.length,
      unusedTools: unusedCount,
      unusedRatio: names.length ? Number((unusedCount / names.length).toFixed(3)) : 0,
      unusedGroups: groups.map((g) => ({
        tag: g.tag,
        unused: g.unused,
        total: g.total,
        hint: `${g.tag}: ${g.unused}/${g.total} 从没被调用过`,
      })),
      topUsed: top,
      // 【认领判据用】全量按标签统计（不截断、不过滤）：
      // 判断"这个标签能不能认领"需要知道它有没有工具真的被调用过。
      // 只在内部判据里用，不写进 route_status 输出（48 个标签会把输出翻倍）。
      byTag: [...byTag.values()].map((g) => ({
        tag: g.tag,
        total: g.total,
        unused: g.unused,
        used: g.total - g.unused,
      })),
      advice: unusedCount > 0
        ? `有 ${unusedCount} 个工具自安装以来一次都没被调用过；对应的插件可以考虑卸载`
        : '所有工具都至少被调用过一次',
    }
  }

  return {
    record,
    summarize,
    flush,
    /** 测试用：直接看原始计数 */
    _raw: () => Object.fromEntries(tools),
  }
}
