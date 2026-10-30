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
    // 被认领、但不在本阶段的标签 = 本阶段禁止的组
    const forbidden = [...claimed].filter((tag) => !allow.includes(tag)).sort()
    const allowText = allow.length > 0 ? allow.join(',') : '仅基础'
    // 【要点】禁止组可能很多（现在有 19 个标签），全列出来会把 200 字吃满，
    // 反而挤掉最重要的"怎么切换"。所以超过 8 个就只列前 8 个 + 总数。
    const forbidText =
      forbidden.length === 0
        ? '无'
        : forbidden.length <= 8
          ? forbidden.join(',')
          : `${forbidden.slice(0, 8).join(',')} 等${forbidden.length}组`
    text =
      `【路由】阶段=${stage} 允许组=${allowText} 禁止组=${forbidText}。` +
      `用禁止组会被立刻拦截；切换阶段用 route_stage("core")。`
  }

  const limit = HINT_LIMIT
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
