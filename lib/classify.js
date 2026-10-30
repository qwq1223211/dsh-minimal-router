/**
 * ============================================================================
 * dsh-minimal-router · lib/classify.js
 * ============================================================================
 * 「自动分类 + 越界判定」。
 *
 * 设计原则：**零配置自适应**。
 *   —— 标签不是手写的清单，而是从工具名里"长"出来的：
 *        unity_script_create → unity
 *        meshy_image_to_3d   → meshy
 *        ui_add              → ui
 *        read                → core（没有下划线的一律算 core）
 *      所以你今天装 50 个新插件，明天它们的标签自动就有了，不用改任何配置文件。
 *
 * 设计原则：**不误杀未分类的东西**。
 *   —— 只有"被某个阶段明确认领过"的标签才参与阶段管理。
 *      一个全新插件的标签 foo 没人认领 → 任何阶段都放行。
 *      这样"自适应"就不会变成"新插件一装就被拦"。
 * ============================================================================
 */

import { isCoreTool } from './stages-config.js'

// 【修改这里】这些工具永远放行，永远不被路由层拦截（逃生门 · 铁律）
// 注意：guard 那边也有一份白名单，两边都要有，缺一边就会被另一边的熔断挡住。
export const ALWAYS_ALLOW = Object.freeze([
  'route_stage', // 切阶段
  'route_status', // 看状态
  'route_reset', // 复位（逃生门）
  'route_init', // 生成自定义阶段模板
  'guard_status', // guard 的查询
  'guard_reset', // guard 的复位（逃生门）
])

/**
 * 从工具名推标签。
 *
 * 三种形态都要认：
 *   unity_script_create        → unity
 *   mcp__meshy__meshy_image    → meshy   ← MCP 工具是 mcp__<server>__<tool>，真正的组在中间
 *   read / create_goal         → core    ← 基础工具（用显式名单，别靠前缀猜）
 *
 * @param {string} toolName
 * @param {string[]} [coreTools] 基础工具名单
 * @returns {string} 标签；取不到就返回 'core'
 */
export function tagOf(toolName, coreTools) {
  const name = typeof toolName === 'string' ? toolName.trim() : ''
  if (!name) return 'core'
  // 显式名单优先：create_goal / list_agents / read_mcp_resource 这些
  // 靠前缀会被猜成 create / list / read，全是假标签
  if (isCoreTool(name, coreTools)) return 'core'
  // MCP 工具：组名藏在两个双下划线之间（必须是 mcp__server__tool 三段）
  if (name.startsWith('mcp__')) {
    const parts = name.split('__').filter((part) => part.length > 0)
    if (parts.length >= 3) return parts[1].toLowerCase()
  }
  const index = name.indexOf('_')
  if (index <= 0) return 'core'
  return name.slice(0, index).toLowerCase()
}

/**
 * 扫一遍当前所有工具，算出标签目录。
 * @param {string[]} toolNames
 * @param {string[]} [coreTools]
 * @returns {{tags: Record<string, number>, total: number}}
 */
export function buildCatalog(toolNames, coreTools) {
  const list = Array.isArray(toolNames) ? toolNames : []
  const tags = {}
  for (const name of list) {
    const tag = tagOf(name, coreTools)
    tags[tag] = (tags[tag] || 0) + 1
  }
  return { tags, total: list.length }
}

/**
 * 算出"被阶段认领过"的标签集合。
 * 只有在这张表里的标签，才会被阶段规则限制。
 * @param {Record<string, {allow?: string[]}>} stages
 * @returns {Set<string>}
 */
export function claimedTags(stages) {
  const claimed = new Set()
  const table = stages && typeof stages === 'object' ? stages : {}
  for (const definition of Object.values(table)) {
    const allow = definition && Array.isArray(definition.allow) ? definition.allow : []
    for (const tag of allow) if (typeof tag === 'string' && tag) claimed.add(tag.toLowerCase())
  }
  return claimed
}

/**
 * 核心判定：这次工具调用该放行还是拦截？
 *
 * 判定顺序（短路，越靠前越优先）：
 *   1. 逃生门工具 → 放行
 *   2. 阶段是 auto → 放行（纯提示模式，零摩擦）
 *   3. 工具属于当前阶段的 allow → 放行
 *   4. 标签没被任何阶段认领（新插件） → 放行（不误杀）
 *   5. 其余 → 拦截，并给出祈使句
 *
 * @param {{toolName:string, stage:string, stages:object, claimed:Set<string>}} input
 * @returns {{allow:boolean, reason:string}}
 */
export function decideOutOfStage(input) {
  const toolName = typeof input?.toolName === 'string' ? input.toolName : ''
  const stage = typeof input?.stage === 'string' && input.stage ? input.stage : 'auto'
  const stages = input?.stages && typeof input.stages === 'object' ? input.stages : {}
  const claimed = input?.claimed instanceof Set ? input.claimed : claimedTags(stages)

  // 1. 逃生门
  if (ALWAYS_ALLOW.includes(toolName)) return { allow: true, reason: '' }

  // 2. auto 阶段：只提示不拦
  if (stage === 'auto') return { allow: true, reason: '' }

  const definition = stages[stage]
  // 阶段名不认识（被删了/拼错了）→ 当作 auto，别拦人
  if (!definition) return { allow: true, reason: '' }

  const tag = tagOf(toolName, input?.coreTools)
  const allow = Array.isArray(definition.allow) ? definition.allow.map((t) => String(t).toLowerCase()) : []

  // 3. 当前阶段允许
  if (allow.includes(tag)) return { allow: true, reason: '' }

  // 4. 没人认领的标签（新插件）→ 放行
  //    【严格模式】stage.strict = true 时取消这条豁免：
  //    这正是"别人那套工具一个都没被认领"环境里唯一能真正瘦身的办法。
  //    默认为 false，保持"绝不误杀"。
  if (!claimed.has(tag) && definition.strict !== true) return { allow: true, reason: '' }

  // 5. 拦截：祈使句，把"该怎么办"说到不能再具体
  const allowText = allow.length > 0 ? allow.join('/') : '（只有基础工具）'
  const target = suggestStageForTag(tag, stages)
  const howTo = target ? `请立即调用 route_stage("${target}") 切到对应阶段，` : '请立即调用 route_status 查看可用阶段，'
  return {
    allow: false,
    reason:
      `【阶段越界】当前阶段=${stage}，禁止使用 ${tag}_* 类工具（这次是 ${toolName}）。` +
      `本阶段允许：${allowText}。${howTo}或改用本阶段允许的工具重试。`,
  }
}

/**
 * 给一个标签，猜它该去哪个阶段（用于生成"该切到哪"的提示）。
 * @param {string} tag
 * @param {Record<string, {allow?: string[]}>} stages
 * @returns {string} 阶段名；找不到返回空串
 */
export function suggestStageForTag(tag, stages) {
  const table = stages && typeof stages === 'object' ? stages : {}
  for (const [name, definition] of Object.entries(table)) {
    if (name === 'auto') continue
    const allow = definition && Array.isArray(definition.allow) ? definition.allow : []
    if (allow.map((t) => String(t).toLowerCase()).includes(tag)) return name
  }
  return ''
}

/**
 * 算出"要物理摘掉"的工具名单（供 ctx.tools.restrict 使用）。
 *
 * 注意：这里和 decideOutOfStage 用完全相同的判定，
 * 保证"能看到的"和"能调用的"永远一致，不会出现"列表里没有但还能调"的漏洞。
 *
 * @param {{toolNames:string[], stage:string, stages:object, claimed:Set<string>}} input
 * @returns {string[]} 需要 deny 的工具名
 */
export function computeDenyList(input) {
  const names = Array.isArray(input?.toolNames) ? input.toolNames : []
  const stage = input?.stage
  const stages = input?.stages
  const claimed = input?.claimed
  const deny = []
  for (const name of names) {
    if (typeof name !== 'string' || !name) continue
    const verdict = decideOutOfStage({ toolName: name, stage, stages, claimed, coreTools: input?.coreTools })
    if (!verdict.allow) deny.push(name)
  }
  return deny
}
