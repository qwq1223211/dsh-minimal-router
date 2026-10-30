/**
 * ============================================================================
 * dsh-minimal-router · lib/model-guard.js
 * ============================================================================
 * 「模型能力检测 + 降级判定」。
 *
 * 【为什么必须有这个模块】
 * 本插件的核心假设是：**系统提示的变更可以追加到历史尾部**（不重写头部）。
 * 这个能力不是所有模型都有，它由适配器声明：
 *
 *   // dsh-llm-deepseek/lib/index.js 的内置模型表（源码直读）
 *   { id: "deepseek-flash",  systemPromptUpdate: "in-history", toolUpdate: "addition-only" }
 *   { id: "deepseek-v4-pro"  这两项都没有 → 等价于 leading-only }
 *
 * 注意：上面那行本来是带反注释的原文，但块注释里不能再出现注释结束符，
 * 否则会把外层的 JSDoc 提前闭合（实测踩过，直接语法错误），所以这里去掉了。
 *
 * 如果模型不支持 in-history：
 *   我们的尾部提示每步都重新渲染 → 系统提示每步都在变 → DSH 只能"重写头部"
 *   → 前缀第一个字节就变了 → **每一步都是全量缓存失效**
 *   → 400K/步 × 全价 × 几十步 = 账单爆炸
 *
 * 所以：**不确定安全的时候，一律按不安全处理**（fail-safe）。
 * 宁可少省点钱，也不能让别人的账单失控。
 * ============================================================================
 */

/**
 * 已知模型的能力表。
 * 【修改这里】以后 DSH 出新模型，就在这里加一行；不确定的一律不写（会被当作不安全）。
 */
export const KNOWN_CAPABILITIES = Object.freeze({
  'deepseek-flash': {
    systemPromptUpdate: 'in-history',
    toolUpdate: 'addition-only',
  },
  'deepseek-v4-pro': {
    // 源码里这两项确实没有 → 等价于 leading-only
    systemPromptUpdate: 'leading-only',
    toolUpdate: 'leading-only',
  },
})

/**
 * 模型名归一化。
 *
 * 【别的部署实测踩的坑】配置里很容易写成 `bailian/deepseek-v4.1-flash-1017`
 * （带 provider 前缀），而运行时 `options.model` 是**纯模型 ID**。
 * 直接字符串比较就永远不命中：用户改完以为生效了，其实还是 degraded。
 * 所以两边都归一化：去空格、转小写、去掉 `<provider>/` 前缀。
 *
 * @param {unknown} value
 * @returns {string}
 */
export function bareModelName(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!text) return ''
  const parts = text.split('/')
  return parts[parts.length - 1]
}

/**
 * 判定一次请求用的模型安不安全。
 *
 * @param {{provider?:string, model?:string, table?:object, unsafeForce?:boolean,
 *          requireInHistory?:boolean, trusted?:string[]}} input
 * @returns {{safe:boolean, source:string, systemPromptUpdate:string, reason:string}}
 */
export function resolveCapability(input = {}) {
  const provider = typeof input.provider === 'string' ? input.provider : ''
  const model = typeof input.model === 'string' ? input.model : ''
  const table = input.table && typeof input.table === 'object' ? input.table : KNOWN_CAPABILITIES
  const requireInHistory = input.requireInHistory !== false
  const trusted = Array.isArray(input.trusted) ? input.trusted.map(bareModelName).filter(Boolean) : []
  const bare = bareModelName(model)

  // 1) 用户强行要求开启（自担风险）
  if (input.unsafeForce === true) {
    return {
      safe: true,
      source: 'forced',
      systemPromptUpdate: 'forced',
      reason: 'forced on via unsafeForce; cache risk is the user\'s',
    }
  }

  // 2) 用户白名单：本地代理 / 自定义部署（自己确认过支持 in-history）
  if (bare && trusted.includes(bare)) {
    return {
      safe: true,
      source: 'trusted',
      systemPromptUpdate: 'in-history',
      reason: '',
    }
  }

  // 2) 没拿到模型名 → 无法判断 → 按不安全处理
  if (!model) {
    return {
      safe: false,
      source: 'unknown',
      systemPromptUpdate: 'unknown',
      reason: 'model name not known yet, cannot confirm mid-conversation system prompt support (fail-safe: treated as unsafe)',
    }
  }

  // 3) 已收录的模型：看它的 systemPromptUpdate
  //    查表也走归一化名，这样 `deepseek-account/deepseek-flash` 这种写法也认
  const known = table[bare] || table[model]
  if (known) {
    const mode = typeof known.systemPromptUpdate === 'string' ? known.systemPromptUpdate : 'unknown'
    const safe = requireInHistory ? mode === 'in-history' : true
    return {
      safe,
      source: 'table',
      systemPromptUpdate: mode,
      reason: safe
        ? ''
        : `模型 ${model} 的 systemPromptUpdate 是 "${mode}"（不是 in-history），系统提示一变就会重写前缀`,
    }
  }

  // 4) 未收录的模型 → fail-safe
  return {
    safe: false,
    source: 'unknown',
    systemPromptUpdate: 'unknown',
    reason: `model ${provider ? `${provider}/` : ''}${model} is not in the known capability table; treated as unsafe`,
  }
}

/**
 * 降级时打印的醒目警告框（一次性，不刷屏）。
 * @param {{provider:string, model:string, reason:string}} input
 * @returns {string}
 */
export function formatDegradeWarning(input = {}) {
  const provider = input.provider || '?'
  const model = input.model || '?'
  const reason = input.reason || '未知原因'
  const line = '═'.repeat(64)
  const bar = '║'
  const rows = [
    '⚠ dsh-minimal-router 已自动降级',
    '',
    `当前模型：${provider} / ${model}`,
    `原因：${reason}`,
    '',
    '为什么降级很重要：',
    '  这个模型不支持"系统提示追加到历史"，系统提示一变就会重写前缀，',
    '  导致每一步的缓存全部失效。继续注入尾部提示会让账单暴涨数倍。',
    '',
    '已关闭：尾部路由提示、物理瘦身（restrict）',
    '仍保留：越界拦截、死循环体检（这两项不碰 prompt，零缓存成本）',
    '',
    '确实知道风险还想开：config 里设 unsafeForce: true',
  ]
  const body = rows.map((row) => `${bar} ${row.padEnd(60)} ${bar}`).join('\n')
  return `\n╔${line}╗\n${body}\n╚${line}╝`
}
