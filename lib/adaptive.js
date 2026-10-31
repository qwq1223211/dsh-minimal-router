/**
 * ============================================================================
 * dsh-minimal-router · lib/adaptive.js
 * ============================================================================
 * 「自适应阶段」——从**实际调用**里学，而不是从关键词里猜。
 *
 * 【为什么它比关键词靠谱】
 *   关键词看你**说了什么**；这张窗口看你**真的用了什么**。
 *   一个人连续 8 次调用 unity_*，比他说"代码"两个字更能说明他在写 Unity。
 *
 * 【为什么默认关闭】
 *   它会**自动切阶段**。切阶段要付一次前缀重建（实测最贵 51 万 token）。
 *   所以：默认关；开了也要过成本闸门 + 迟滞；而且只在 auto 阶段才敢动。
 *
 * 【为什么用滑动窗口而不是长期画像】
 *   长期画像会被"上个月做过 Unity"污染。窗口只看最近 N 次，任务一换就自动失效。
 * ============================================================================
 */

/**
 * 一个按会话维护的环形窗口。
 *
 * @param {{size?:number}} [options]
 */
export function createSignalWindow(options = {}) {
  const size = Number.isFinite(options.size) ? Math.max(3, Math.trunc(options.size)) : 20
  const ring = []

  function push(tag) {
    const t = typeof tag === 'string' ? tag.trim().toLowerCase() : ''
    if (!t || t === 'core') return // 基础工具不算信号：它哪个阶段都在
    ring.push(t)
    if (ring.length > size) ring.shift()
  }

  /**
   * 最近若干次里，某个组是否占绝对多数。
   *
   * @param {{minCalls?:number, minShare?:number, window?:number}} [opts]
   * @returns {{tag:string, calls:number, total:number, share:number}|null}
   */
  function dominant(opts = {}) {
    const minCalls = Number.isFinite(opts.minCalls) ? opts.minCalls : 6
    const minShare = Number.isFinite(opts.minShare) ? opts.minShare : 0.6
    const win = Number.isFinite(opts.window) ? Math.max(1, Math.trunc(opts.window)) : ring.length
    const slice = ring.slice(-win)
    if (slice.length < minCalls) return null

    const counts = new Map()
    for (const t of slice) counts.set(t, (counts.get(t) || 0) + 1)
    const [tag, calls] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (!tag || calls < minCalls) return null

    const share = calls / slice.length
    if (share < minShare) return null

    return { tag, calls, total: slice.length, share: Number(share.toFixed(2)) }
  }

  const snapshot = () => [...ring]
  const reset = () => {
    ring.length = 0
  }

  return { push, dominant, snapshot, reset, size }
}

/**
 * 按会话管理多个窗口（超过上限就淘汰最老的）。
 *
 * 拆出来的原因：index.js 有 1200 行守卫线，而这段逻辑和"窗口数学"是同一件事。
 *
 * @param {{size?:number, max?:number}} [options]
 */
export function createSignalStore(options = {}) {
  const size = Number.isFinite(options.size) ? Math.max(3, Math.trunc(options.size)) : 20
  const max = Number.isFinite(options.max) ? Math.max(1, Math.trunc(options.max)) : 200
  const windows = new Map()

  function forKey(key) {
    let w = windows.get(key)
    if (!w) {
      w = createSignalWindow({ size })
      windows.set(key, w)
      if (windows.size > max) {
        const oldest = windows.keys().next().value
        if (oldest !== undefined && oldest !== key) windows.delete(oldest)
      }
    }
    return w
  }

  return {
    push(key, tag) {
      forKey(key).push(tag)
    },
    dominant(key, opts) {
      return forKey(key).dominant(opts)
    },
    reset(key) {
      windows.delete(key)
    },
    size: () => windows.size,
  }
}
