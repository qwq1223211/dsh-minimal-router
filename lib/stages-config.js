/**
 * ============================================================================
 * dsh-minimal-router · lib/stages-config.js
 * ============================================================================
 * 「通用适配」：让别的领域的人不改代码就能定义自己的阶段。
 *
 * 三件事：
 *   1. 读 custom_stages.json（用户自己写的阶段表），校验 + 合并
 *   2. 扫描当前工具，找出"还没被任何阶段管"的标签
 *   3. 生成一份基于**真实环境**的模板（不是空白范文）
 *
 * 【设计底线】
 *   · 用户 JSON 写错了 → 整份忽略 + 告警，回退内置表（绝不让一个逗号把插件搞挂）
 *   · 模板只写"建议"，绝不自动启用（猜错阶段会拦人，比不分类更糟）
 *   · 未认领的标签永远放行（新插件不会被误杀）
 * ============================================================================
 */

import { readFile } from 'node:fs/promises'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { withUnion } from './union.js'

/**
 * 内置示例配置目录（examples/*.json）。
 * 放在这里而不是 index.js：它和"阶段表从哪来"是同一件事。
 */
export const PRESETS_DIR = fileURLToPath(new URL('../examples/', import.meta.url))

/**
 * 列出可用的内置示例。
 * @returns {string[]}
 */
export function listPresets() {
  try {
    return readdirSync(PRESETS_DIR)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/i, ''))
      .sort()
  } catch {
    return []
  }
}

/**
 * 读取并解析一个内置示例。
 * @param {string} name 示例名（不带 .json）
 * @returns {{ok:boolean, data?:object, error?:string}}
 */
export function readPreset(name) {
  try {
    const text = readFileSync(join(PRESETS_DIR, `${name}.json`), 'utf8')
    return { ok: true, data: JSON.parse(text) }
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) }
  }
}

/**
 * 【修改这里】基础工具名单：这些工具永远算 core，永不参与阶段管理。
 *
 * 为什么需要它：光靠"下划线前缀"猜标签，会把 `create_goal` 猜成 `create`、
 * `list_agents` 猜成 `list`、`read_mcp_resource` 猜成 `read` —— 造出一堆
 * 没人认领的假标签。用显式名单比猜可靠。
 */
export const DEFAULT_CORE_TOOLS = Object.freeze([
  // 文件与执行
  'read', 'write', 'edit', 'glob', 'grep', 'pwsh', 'bash', 'working_directory',
  // 交付与交互
  'present', 'ask_user_question', 'todo_write', 'exit_plan_mode', 'skill',
  // 网络
  'web_search', 'web_fetch',
  // 目标 / 计划
  'create_goal', 'get_goal', 'update_goal',
  // 子智能体
  'subagent', 'subagent_fork', 'send_message', 'list_agents', 'interrupt_agent', 'create_worktree',
  // 后台任务
  'job_list', 'job_output', 'job_kill',
  // 终端
  'terminal_open', 'terminal_send', 'terminal_read', 'terminal_list', 'terminal_signal', 'terminal_close',
  // 会话检索
  'session_search', 'session_trace', 'session_event_search', 'session_event_read', 'session_event_trace',
  // 编排
  'workflow', 'schedule_create', 'schedule_list', 'schedule_update', 'schedule_delete',
  // 自适应记忆
  'adapt_status', 'adapt_remember', 'adapt_forget', 'adapt_plugins', 'adapt_sync',
  // 插件管理 / 内省
  'plugin_manager', 'plugin_market', 'cordis_inspect_list', 'cordis_inspect_query',
  // 工具链自检
  'load_workspace_dependencies',
  // MCP
  'mcp_probe', 'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource',
])

/** 判断某个工具算不算"基础工具"（显式名单 + 没有下划线的名字） */
export function isCoreTool(toolName, coreTools = DEFAULT_CORE_TOOLS) {
  const name = typeof toolName === 'string' ? toolName : ''
  if (!name) return true
  const list = Array.isArray(coreTools) ? coreTools : DEFAULT_CORE_TOOLS
  if (list.includes(name)) return true
  return name.indexOf('_') < 0
}

/**
 * 把 stages 统一成"名字 → 定义"的对象。
 *
 * 【别的部署实测踩的坑】用户很自然会写成**数组**：
 *   { "stages": [ { "stage": "chat", "allow": [...] }, ... ] }
 * 而旧版只接受对象 map，于是整份配置被当成"无效"静默忽略——
 * 用户以为改完了，其实什么都没生效。
 * 现在两种形状都接受。
 *
 * @param {unknown} raw
 * @param {string[]} errors
 * @returns {Record<string, object> | null}
 */
export function normalizeStagesShape(raw, errors = []) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw

  if (Array.isArray(raw)) {
    const table = {}
    for (const item of raw) {
      if (!item || typeof item !== 'object') {
        errors.push('stages 数组里的每一项都必须是对象')
        continue
      }
      const name =
        typeof item.stage === 'string' && item.stage
          ? item.stage
          : typeof item.name === 'string' && item.name
            ? item.name
            : ''
      if (!name) {
        errors.push('stages 数组里每一项都要有 stage（或 name）字段')
        continue
      }
      table[name] = {
        title: item.title,
        allow: item.allow,
        keywords: item.keywords,
        strict: item.strict,
      }
    }
    return Object.keys(table).length > 0 ? table : null
  }

  errors.push('缺少 stages（可以是对象 map，也可以是 { stage: ... } 的数组）')
  return null
}

/**
 * 校验 + 规范化用户写的阶段表。
 * 规则：能救的尽量救，救不了的丢掉并报告，绝不让整份配置把插件搞挂。
 *
 * @param {unknown} raw JSON.parse 之后的原始对象
 * @returns {{ok:boolean, stages:Record<string,object>, defaultStage:string, errors:string[]}}
 */
export function validateStagesConfig(raw) {
  const errors = []
  const out = { ok: false, stages: {}, defaultStage: '', errors }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('根节点必须是一个 JSON 对象，例如 { "stages": { ... } }')
    return out
  }

  const table = normalizeStagesShape(raw.stages, errors)
  if (!table) return out

  for (const [name, definition] of Object.entries(table)) {
    if (!name || typeof name !== 'string') {
      errors.push('阶段名必须是非空字符串')
      continue
    }
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      errors.push(`阶段 "${name}" 的值必须是对象`)
      continue
    }
    const allow = Array.isArray(definition.allow) ? definition.allow.filter((x) => typeof x === 'string' && x) : []
    const keywords = Array.isArray(definition.keywords)
      ? definition.keywords.filter((x) => typeof x === 'string' && x)
      : []
    if (definition.allow !== undefined && !Array.isArray(definition.allow)) {
      errors.push(`阶段 "${name}" 的 allow 必须是字符串数组`)
    }
    if (definition.keywords !== undefined && !Array.isArray(definition.keywords)) {
      errors.push(`阶段 "${name}" 的 keywords 必须是字符串数组`)
    }
    out.stages[name] = {
      title: typeof definition.title === 'string' && definition.title ? definition.title : name,
      allow,
      keywords,
      // 严格模式：连"没被任何阶段认领的标签"也一起拒绝（默认 false = 绝不误杀）
      strict: definition.strict === true,
    }
  }

  // defaultStage 必须在 stages 里
  const wanted = typeof raw.defaultStage === 'string' ? raw.defaultStage : ''
  if (wanted && !out.stages[wanted]) {
    errors.push(`defaultStage "${wanted}" 不在 stages 里，已忽略`)
  } else if (wanted) {
    out.defaultStage = wanted
  }

  out.ok = Object.keys(out.stages).length > 0
  if (!out.ok) errors.push('stages 里没有任何有效阶段')
  // 【多领域并集】自定义阶段表也装上 Proxy，
  // 否则一旦用户用 custom_stages.json 覆盖了默认表，`stages["a+b"]` 就解析不了。
  out.stages = withUnion(out.stages)
  return out
}

/**
 * 合并阶段表：后面的覆盖前面的同名阶段。
 * @param {...Record<string, object>} tables
 * @returns {Record<string, object>}
 */
export function mergeStages(...tables) {
  const merged = {}
  for (const table of tables) {
    if (!table || typeof table !== 'object') continue
    for (const [name, definition] of Object.entries(table)) {
      if (!definition || typeof definition !== 'object') continue
      merged[name] = definition
    }
  }
  return merged
}

/**
 * 找出"还没被任何阶段认领"的标签。
 * @param {{tagCounts:Record<string,number>, claimed:Set<string>, coreTools?:string[]}} input
 * @returns {Array<{tag:string, count:number}>}
 */
export function findUnclaimed(input = {}) {
  const tagCounts = input.tagCounts && typeof input.tagCounts === 'object' ? input.tagCounts : {}
  const claimed = input.claimed instanceof Set ? input.claimed : new Set(Array.isArray(input.claimed) ? input.claimed : [])
  const result = []
  for (const [tag, count] of Object.entries(tagCounts)) {
    if (tag === 'core') continue
    if (claimed.has(tag)) continue
    result.push({ tag, count: typeof count === 'number' ? count : 0 })
  }
  result.sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1))
  return result
}

/**
 * 生成模板。基于真实环境：每个未认领的标签给一个注释掉的候选阶段。
 *
 * @param {{tagCounts:Record<string,number>, claimed:Set<string>, stages:object,
 *          defaultStage:string, now?:string}} input
 * @returns {object} 可以直接存成 custom_stages.json 的对象
 */
export function buildTemplate(input = {}) {
  const tagCounts = input.tagCounts && typeof input.tagCounts === 'object' ? input.tagCounts : {}
  const stages = input.stages && typeof input.stages === 'object' ? input.stages : {}
  const claimed = input.claimed instanceof Set ? input.claimed : new Set()
  const unclaimed = findUnclaimed({ tagCounts, claimed })

  return {
    $schema: 'https://example.invalid/dsh-minimal-router/custom_stages.schema.json',
    version: 1,
    generatedAt: input.now || new Date().toISOString(),
    // 保存后改成 custom_stages.json（不要用 .sample.json，那个不会被加载）
    defaultStage: typeof input.defaultStage === 'string' ? input.defaultStage : 'auto',
    // 当前环境里还没被任何阶段管住的工具组（claimed:false 的才需要你处理）
    discovered: Object.entries(tagCounts)
      .map(([tag, count]) => ({
        tag,
        count: typeof count === 'number' ? count : 0,
        claimed: claimed.has(tag),
      }))
      .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1)),
    // 从内置阶段复制一份，方便你在它的基础上改
    stages: JSON.parse(JSON.stringify(stages)),
    // 给你抄的候选：每个未认领的标签一条（改名字、改关键词就能用）
    suggestions: unclaimed.map((entry) => ({
      stage: entry.tag,
      title: `${entry.tag}（${entry.count} 个工具）`,
      allow: [entry.tag],
      keywords: [entry.tag],
      _hint: '把 stage 名和 keywords 改成你平时说的话，然后把它搬到上面的 stages 里',
    })),
    _readme: [
      '1. 把这个文件另存为 custom_stages.json（去掉 .sample）',
      '2. 把 suggestions 里需要的条目搬到 stages 里，并改掉 stage 名和 keywords',
      '3. 在「设置 → 插件」里把「极简路由器」关掉再打开',
      '4. 改完后用 route_status 确认 claimedTags 里出现了你的新标签',
    ],
  }
}

/**
 * 同步版：插件加载时用（load 阶段是同步的，没法 await）。
 * @param {string} file
 * @returns {{found:boolean, ok:boolean, stages:object, defaultStage:string, errors:string[]}}
 */
export function loadCustomStagesSync(file) {
  const empty = { found: false, ok: false, stages: {}, defaultStage: '', errors: [] }
  if (!file || typeof file !== 'string') return empty
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return empty
  }
  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return {
      found: true,
      ok: false,
      stages: {},
      defaultStage: '',
      errors: [`${file} 不是合法 JSON：${error && error.message ? error.message : String(error)}`],
    }
  }
  const checked = validateStagesConfig(raw)
  return { found: true, ...checked }
}

/**
 * 从磁盘读 custom_stages.json。
 * 文件不存在 = 正常情况（返回 found:false，不算错误）。
 *
 * @param {string} file
 * @returns {Promise<{found:boolean, ok:boolean, stages:object, defaultStage:string, errors:string[]}>}
 */
export async function loadCustomStages(file) {
  const empty = { found: false, ok: false, stages: {}, defaultStage: '', errors: [] }
  if (!file || typeof file !== 'string') return empty
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return empty
  }
  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return {
      found: true,
      ok: false,
      stages: {},
      defaultStage: '',
      errors: [`${file} 不是合法 JSON：${error && error.message ? error.message : String(error)}`],
    }
  }
  const checked = validateStagesConfig(raw)
  return { found: true, ...checked }
}
