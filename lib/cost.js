/**
 * ============================================================================
 * dsh-minimal-router · lib/cost.js
 * ============================================================================
 * 「切换值不值」的经济学估算。
 *
 * 【为什么要按最坏情况估】
 * 从 615 条真实探针记录里挖出 60 次前缀变化，成本是**双峰**的：
 *
 *   便宜档（35 次）：未命中 ≈ 上下文的 0.2% ~ 1.2%
 *   灾难档（11 次）：未命中 ≈ 上下文的 98% ~ 99%
 *
 * 而且两档之间**看不出和"改了多少字节"有关**：
 *   · 工具声明改了 98,778 字节 → 未命中只有 708 token
 *   · 工具声明只改了 481 字节  → 未命中 581,830 token（几乎全价）
 *
 * 结论：**便宜是运气，贵是风险**。平均值（46.5%）对双峰分布毫无意义。
 * 所以这里的成本一律按 `rebuildRatio = 1.0`（整段上下文全价）估——
 * 宁可保守地少切几次，也不要乐观地赌一次 50 万 token。
 * ============================================================================
 */

/** 1 字节工具声明 ≈ 多少 token（实测：98,778 字节 ≈ 29,800 token） */
export const DEFAULT_TOKENS_PER_BYTE = 0.3

/** 最坏情况下，重建成本 ≈ 整个上下文的比例 */
export const DEFAULT_REBUILD_RATIO = 1.0

function num(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** 保留两位小数 */
function round2(value) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

/**
 * 估算"现在切一次阶段"划不划算。
 *
 * @param {object} input
 * @param {number} input.contextTokens 当前会话上下文长度（上一次请求的 promptTokens）
 * @param {number} input.deniedBytes   切过去之后会被摘掉的工具声明字节数
 * @param {number} [input.tokensPerByte=0.3]
 * @param {number} [input.rebuildRatio=1.0] 最坏情况下的重建比例
 * @returns {{costTokens:number, savePerTurnTokens:number, paybackTurns:number|null}}
 *   paybackTurns = 需要多少轮才能回本；null 表示"永远回不了本"（省不下任何东西）
 */
export function estimateSwitchEconomy(input = {}) {
  const contextTokens = Math.max(0, num(input.contextTokens, 0))
  const deniedBytes = Math.max(0, num(input.deniedBytes, 0))
  const tokensPerByte = Math.max(0, num(input.tokensPerByte, DEFAULT_TOKENS_PER_BYTE))
  const rebuildRatio = Math.max(0, num(input.rebuildRatio, DEFAULT_REBUILD_RATIO))

  // 一次性支出：按最坏情况算，整段上下文都按全价重建
  const costTokens = Math.round(contextTokens * rebuildRatio)
  // 每轮收益：被摘掉的那部分工具声明，以后每一轮都不用再发
  const savePerTurnTokens = Math.round(deniedBytes * tokensPerByte)
  const paybackTurns = savePerTurnTokens > 0 ? round2(costTokens / savePerTurnTokens) : null

  return { costTokens, savePerTurnTokens, paybackTurns }
}

/**
 * 这次切换该不该放行。
 *
 * 规则：回本所需轮数 ≤ `maxPaybackTurns` 才值得切。
 * @param {{economy:object, maxPaybackTurns:number, enabled?:boolean}} input
 * @returns {{allow:boolean, reason:string}}
 */
export function decideByEconomy(input = {}) {
  const economy = input.economy && typeof input.economy === 'object' ? input.economy : {}
  if (input.enabled === false) return { allow: true, reason: 'cost-gate-disabled' }

  const maxPayback = num(input.maxPaybackTurns, 3)
  const payback = economy.paybackTurns
  const cost = num(economy.costTokens, 0)

  // 还没有上下文数据（比如会话第一步）→ 成本按 0 算，没理由拦
  if (cost <= 0) return { allow: true, reason: 'no-cost-yet' }

  // 省不下任何东西 → 纯亏本，不切
  if (payback === null || !Number.isFinite(payback) || payback <= 0) {
    return { allow: false, reason: 'no-savings' }
  }
  if (payback > maxPayback) {
    return { allow: false, reason: 'payback-too-long' }
  }
  return { allow: true, reason: 'worth-it' }
}

/** 把估算结果写成一句人话（给 route_status / 拦截提示用） */
export function describeEconomy(economy, maxPaybackTurns) {
  const e = economy && typeof economy === 'object' ? economy : {}
  const cost = num(e.costTokens, 0)
  const save = num(e.savePerTurnTokens, 0)
  const payback = e.paybackTurns
  const limit = num(maxPaybackTurns, 3)
  if (payback === null) {
    return `切换赚不回成本：一次性最多 ${cost} token，但每轮省不到 1 token。`
  }
  return (
    `一次性成本最多 ${cost} token（按最坏情况估），每轮省约 ${save} token，` +
    `约需 ${payback} 轮回本（可接受上限 ${limit} 轮）。`
  )
}

/**
 * 量一次"切到这个阶段会摘掉多少字节的工具声明"。
 *
 * 【为什么在 cost.js】这是成本模型的输入之一，和估算公式是同一件事。
 * 放在这里，index.js 只负责装配（顺带守住了它自己的 1500 行体积线）。
 *
 * @param {Array<{name:string, description?:string, parameters?:object}>} schemas 当前可见工具
 * @param {string} stage 目标阶段
 * @param {{stages:object, claimed:Set<string>, coreTools:string[], computeDenyList:Function}} ctx
 * @returns {number} 会被摘掉的字节数（0 = 这个阶段什么都不砍）
 */
export function measureDeniedBytes(schemas, stage, ctx) {
  try {
    const list = Array.isArray(schemas) ? schemas : []
    const names = list.map((tool) => (tool && typeof tool.name === 'string' ? tool.name : '')).filter(Boolean)
    const deny = new Set(
      ctx.computeDenyList({
        toolNames: names,
        stage,
        stages: ctx.stages,
        claimed: ctx.claimed,
        coreTools: ctx.coreTools,
      }),
    )
    if (deny.size === 0) return 0
    let bytes = 0
    for (const tool of list) {
      if (!tool || !deny.has(tool.name)) continue
      bytes += JSON.stringify({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }).length
    }
    return bytes
  } catch {
    return 0
  }
}
