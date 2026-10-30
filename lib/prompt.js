/**
 * ============================================================================
 * dsh-minimal-router · lib/prompt.js
 * ============================================================================
 * 生成"尾部路由提示"。
 *
 * 铁律：**不得超过 200 字**（硬校验，超了就截断并告警）。
 * 这一段是每步都要重新发送的"变动区"，写长了等于每步多烧钱；
 * 而且它在缓存前缀之后，写长了不会破坏缓存，但会线性增长成本。
 *
 * 另一条铁律：这段文本**只用于提示**，不做鉴权。
 * 真正的拦截在 tools/pre-execute（lib/classify.js），提示只是让模型少犯错。
 * ============================================================================
 */

/** 【修改这里】尾部提示的硬上限（字符数）。不要超过 200。 */
export const HINT_LIMIT = 200

/**
 * 渲染当前阶段提示。
 * @param {{stage:string, stages:object, claimed:Set<string>, catalog:object}} input
 * @returns {{text:string, truncated:boolean, length:number}}
 */
export function renderHint(input) {
  const stage = typeof input?.stage === 'string' && input.stage ? input.stage : 'auto'
  const stages = input?.stages && typeof input.stages === 'object' ? input.stages : {}
  const claimed = input?.claimed instanceof Set ? input.claimed : new Set()
  const catalog = input?.catalog && typeof input.catalog === 'object' ? input.catalog : { tags: {}, total: 0 }

  const definition = stages[stage]
  let text

  if (!definition || stage === 'auto') {
    // auto：只给一句轻提示，不制造任何约束感
    text = `【路由】阶段=auto（全部工具可用）。提到 UI/代码/美术/音频会自动切阶段；显式切换用 route_stage("unity-ui")。`
  } else {
    const allow = Array.isArray(definition.allow) ? definition.allow : []
    const allowText = allow.length > 0 ? allow.join(',') : '仅基础'
    // 【A/B 实测的关键结论】这里**故意不再列禁止组**。
    //
    // 实测（两个全新会话，唯一差异是有没有这条提示）：
    //   · 无提示：直接调用 unity_object_create → 被拒 → 拒绝信息精确写着
    //     "请立即调用 route_stage(\"unity-code\")" → 切阶段 → 成功恢复。
    //   · 有提示：提示里写的是"禁止组=audio,dialogue,… 等15组"，而 unity 恰好被
    //     压缩进了"等15组"（因为超过 8 个就截断）→ 模型判定"做不到"→ 直接放弃。
    //
    // 也就是说：**这条提示在跟拒绝信息竞争，而且它输了**——
    // 拒绝信息精确到工具名和目标阶段，被截断的禁止组清单只会制造挫败感。
    // 所以只留"可用组"+"一个永远正确的逃生动作"，篇幅也从 193 字降到 80 字以内。
    text =
      `【路由】阶段=${stage} 可用组=${allowText}。` +
      `其它组的工具已移出列表（不是报错）；真需要就先 route_stage("auto") 全放开。`
  }

  // 【可配置上限】默认 200，允许调小（有人担心尾部提示变成"引导噪音"）
  const wanted = Number(input?.limit)
  const limit = Number.isFinite(wanted) && wanted >= 40 ? Math.trunc(wanted) : HINT_LIMIT
  if (text.length <= limit) return { text, truncated: false, length: text.length }
  // 【硬校验】超限就截断，并在结尾标出来，方便你一眼看出"配置写太长了"
  const cut = `${text.slice(0, limit - 1)}…`
  return { text: cut, truncated: true, length: cut.length }
}

/**
 * 从阶段表里把所有"被认领的标签"列出来，用于生成提示语。
 * @param {Record<string, {allow?: string[]}>} stages
 * @param {string[]} claimedList
 * @returns {string[]}
 */
export function sortedClaimed(stages, claimedList) {
  const list = Array.isArray(claimedList) ? [...claimedList] : []
  return list.sort()
}
