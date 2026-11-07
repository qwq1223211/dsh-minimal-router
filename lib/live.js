/**
 * ============================================================================
 * dsh-minimal-router · lib/live.js
 * ============================================================================
 * 运行时共享的"当前阶段"，让**探针**能给每条请求标注它属于哪个阶段。
 *
 * 【为什么用模块单例，而不是 DSH 的 ctx.provide / ctx.get】
 *   1. 探针本来就在尝试 `ctx.get('minimalRouter')`，但全profile 里没有任何插件
 *      provide 过服务，这条路从没被验证过；
 *   2. 路由器和探针在**同一个进程**里，由 index.js 的 apply 同时挂载 —
 *      共享一个模块变量是最稳、零 API 依赖的做法。
 *
 * 【为什么同时存原始 id 和哈希】
 *   路由器用 `keyOf()` 得到的是**原始会话 id**，
 *   探针落盘时存的是 `fnv1a(sessionId)`（不落用户原始 id）。
 *   两边对不上，所以这里两个索引都维护。
 * ============================================================================
 */
import { fnv1a } from './probe-core.js'

/** 原始会话 id → 阶段名 */
const byKey = new Map()
/** 会话 id 的哈希 → 阶段名（探针用这个查） */
const byHash = new Map()
/** 最多记多少个会话，防止长跑进程无限增长 */
const MAX_ENTRIES = 200

/** 会话 id 的哈希（与探针落盘的口径保持一致） */
export function hashOf(sessionId) {
  return typeof sessionId === 'string' && sessionId ? fnv1a(sessionId) : ''
}

/**
 * 记一次"这个会话现在处于哪个阶段"。
 * 由 index.js 在预执行钩子和阶段切换后调用。
 * @param {string} sessionKey 原始会话 id（keyOf 的结果）
 * @param {string} stage 阶段名
 */
export function noteStage(sessionKey, stage) {
  if (typeof stage !== 'string' || !stage) return
  if (typeof sessionKey === 'string' && sessionKey) {
    byKey.set(sessionKey, stage)
    const hash = hashOf(sessionKey)
    if (hash) byHash.set(hash, stage)
  }
  if (byKey.size > MAX_ENTRIES) byKey.delete(byKey.keys().next().value)
  if (byHash.size > MAX_ENTRIES) byHash.delete(byHash.keys().next().value)
}

/**
 * 用会话哈希查阶段（探针调用）。
 * @param {string} hash
 * @returns {string} 阶段名；查不到返回空串
 */
export function stageOfHash(hash) {
  if (typeof hash !== 'string' || !hash) return ''
  return byHash.get(hash) || ''
}

/** 用原始会话 id 查阶段（调试/自检用）。 */
export function stageOfKey(sessionKey) {
  if (typeof sessionKey !== 'string' || !sessionKey) return ''
  return byKey.get(sessionKey) || ''
}

/** 当前记住了多少个会话（自检用）。 */
export function liveSize() {
  return byKey.size
}
