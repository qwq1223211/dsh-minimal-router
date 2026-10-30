/**
 * ============================================================================
 * dsh-minimal-router —— S1：自动分类 + 本地体检 + 降级保护 + 路由注入
 * ============================================================================
 *
 * 【架构原则】物理边界铁血，业务逻辑自由。
 *
 *   铁血（规则层，写死不许动）：
 *     1. 缓存红线 —— **绝不动态修改头部工具列表**。不调 restrict、不增删工具。
 *        路由提示只走 systemPrompt.context()（尾巴），且硬校验 ≤200 字。
 *     2. 防死循环红线 —— 写文件前用本地规则扫 while(true) / for(;;) / 无出口循环。
 *     3. 逃生门底线 —— route_* / guard_* 永远放行，永远不被拦截。
 *
 *   自由（业务层，模型自己判断）：
 *     · 阶段怎么切由模型/关键词决定，判错了靠拦截报错来纠正，不提前写死规则。
 *
 * 【为什么前缀不会变小（必须说清楚）】
 *   因为铁律 1 禁止改工具列表，所以 184 个工具、147KB 声明、26.6 万 token 一分不少。
 *   本插件解决的是"模型选错工具"，不是"前缀太肥"。想省 token 只有两条路：
 *     · 允许 restrict 过滤工具列表（要付一次前缀重建）
 *     · 元工具把工具折叠起来（要牺牲 schema 可靠性）
 *   这两条都等你点头，S1 不做。
 * ============================================================================
 */

import {
  ALWAYS_ALLOW,
  tagOf,
  buildCatalog,
  claimedTags,
  decideOutOfStage,
  computeDenyList,
} from './lib/classify.js'
import { createStageState, textOfMessage, detectStage, isExplicitSwitch, createSwitchArbiter } from './lib/stage.js'
import { estimateSwitchEconomy, decideByEconomy, describeEconomy } from './lib/cost.js'
import { renderHint, HINT_LIMIT } from './lib/prompt.js'
import { scanCode, formatFindings } from './lib/lint.js'
import { resolveCapability, formatDegradeWarning } from './lib/model-guard.js'
// ---- 同包的两个模块：熔断器 + 缓存探针 ----
// 它们各自是独立的 apply 函数，工具名互不冲突（guard_* / cache_probe_* / route_*）
import { applyGuard } from './lib/guard.js'
import { applyProbe } from './lib/probe.js'
import {
  DEFAULT_CORE_TOOLS,
  loadCustomStagesSync,
  mergeStages,
  buildTemplate,
  findUnclaimed,
  validateStagesConfig,
} from './lib/stages-config.js'

// 内置示例配置目录（别人可以直接挑一个用，不必从零写 JSON）
const PRESETS_DIR = fileURLToPath(new URL('./examples/', import.meta.url))

/** 列出可用的内置示例 */
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
import { fileURLToPath } from 'node:url'
import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/**
 * 【运行时数据目录】必须放在包外面。
 *
 * 为什么：用 `dsh plugin add github:...` 安装时，包会被 pnpm 放进
 * `node_modules/.pnpm/<hash>/`，那是个**会被重装整体替换**的虚拟目录，
 * 升级一次数据就没了，也可能根本没有写权限。
 * link 安装（本地目录）看不出这个问题——所以这个坑只在"别人装了"的时候才炸。
 */
export const STATE_DIR = join(homedir(), '.dsh', 'minimal-router')

// 【修改这里】插件在插件管理器里显示的名字
export const name = 'minimal-router'

// 【修改这里】依赖的服务。
// 只硬依赖 tools：它是三个模块共同的基础（注册工具、拦截调用）。
// systemPrompt 是**可选**的——缺了它只丢"尾部提示"，熔断 / 体检 / 探针照常工作。
// 早期版本把 systemPrompt 写进 inject，结果任何缺这个服务的环境整个插件都加载不了。
export const inject = ['tools']

/**
 * 取一个"可选服务"：先试 ctx.get（Cordis 标准），再退回属性访问。
 * @param {object} ctx
 * @param {string} name
 * @returns {any}
 */
function optionalService(ctx, name) {
  try {
    if (ctx && typeof ctx.get === 'function') {
      const value = ctx.get(name)
      if (value) return value
    }
  } catch {
    // 没 provide 会抛，忽略
  }
  try {
    return ctx ? ctx[name] : undefined
  } catch {
    return undefined
  }
}

// ============================================================================
// 【修改这里】阶段定义 —— 想加阶段/改关键词就在这里改
// allow 里写的是「工具名前缀的标签」，例如 'unity' 会罩住 unity_* 全部工具。
// ============================================================================
export const DEFAULT_STAGES = {
  auto: {
    title: '自动',
    allow: [],
    keywords: [],
  },
  core: {
    title: '通用',
    allow: [],
    keywords: ['通用', '基础', 'core'],
  },
  // 【修改这里】Unity 代码阶段：把 Unity 的全部子系统都收进来（安全网必须密）
  'unity-code': {
    title: 'Unity 代码',
    allow: [
      'unity',
      'asset',
      'level',
      'perf',
      'save',
      'lighting',
      'player',
      'enemy',
      'l10n',
      'gameplay',
      'dialogue',
      'quest',
      'uikit',
      'uiflow',
    ],
    keywords: ['代码', '脚本', '编译', '报错', 'controller', 'script', 'compile', 'c#', 'csharp', 'unity'],
  },
  // 【修改这里】Unity UI 阶段：UI 相关的子系统也一起收进来
  'unity-ui': {
    title: 'Unity UI',
    allow: ['unity', 'ui', 'uikit', 'uiflow', 'dialogue', 'quest'],
    keywords: ['界面', '按钮', '布局', 'canvas', 'hud', 'panel', '面板', 'ui'],
  },
  art: {
    title: '美术',
    allow: ['art', 'meshy', 'image', 'asset'],
    keywords: ['贴图', '模型', '素材', '美术', 'texture', 'model', 'sprite', 'mesh', 'icon'],
  },
  audio: {
    title: '音频',
    allow: ['audio'],
    keywords: ['音效', '音乐', 'audio', 'sfx', 'bgm'],
  },
}

// 【修改这里】关键词匹配顺序：越靠前越优先（更具体的放前面）
const STAGE_ORDER = ['unity-ui', 'art', 'audio', 'unity-code', 'core']

const CONFIG_DEFAULTS = {
  // 【修改这里】没有任何命中时的阶段。'auto' = 只提示不拦截（零摩擦，推荐）
  defaultStage: 'auto',
  // 【修改这里】是否启用阶段拦截。false = 只提示不拦
  enforceStage: true,
  // 【修改这里】★ 是否用 restrict() 物理砍掉不属于当前阶段的工具（省 token 的关键开关）
  //   false = 只靠提示+拦截，前缀一个字节都不变（零缓存风险，也零省钱）
  //   true  = 阶段切换时真的把无关工具从请求里摘掉；代价是切换瞬间付一次缓存重建
  // 【注意】打开它会改变"头部工具列表"，和之前的缓存红线是冲突的——这是你明确要求的解禁。
  enforceByRestrict: false,
  // 【修改这里】本地体检模式：'deny' 拦截 / 'warn' 只记日志 / 'off' 关闭
  lintMode: 'deny',
  // 【修改这里】★ 降级保护：只有确认模型支持"系统提示追加到历史"才敢开尾插
  //   打包/开源给别人用的时候，这个必须保持 true（别人的模型可能不支持）
  requireInHistoryUpdates: true,
  // 【修改这里】明知道有缓存风险也要强行开启（自担风险，默认 false）
  unsafeForce: false,
  // 【修改这里】信任的模型白名单：本地代理 / 自定义部署（你自己确认过支持 in-history 才往里加）
  trustedModels: [],
  // 【修改这里】降级时是否在控制台打醒目警告
  warnOnDegrade: true,
  // 【修改这里】这些工具的入参不参与体检（只读类工具，参数里出现代码片段是正常的）
  lintSkipTools: [
    'read',
    'grep',
    'glob',
    'web_search',
    'web_fetch',
    'session_search',
    'session_event_search',
    'session_trace',
    'cache_probe_report',
    'cache_probe_clear',
    'route_stage',
    'route_status',
    'route_reset',
    'guard_status',
    'guard_reset',
  ],
  // 【修改这里】单个参数文本的最大扫描长度
  lintMaxArgChars: 200000,
  // 【修改这里】最多记住多少个会话的阶段状态
  maxSessions: 200,
  // 【修改这里】自定义阶段表文件（不存在就是正常的，会回退内置表）
  customStagesFile: join(STATE_DIR, 'custom_stages.json'),
  // 【修改这里】基础工具名单：这些永不参与阶段管理
  coreTools: [...DEFAULT_CORE_TOOLS],
  // 【修改这里】★ 安全闸门：会话上下文超过这个 token 数，就拦住"切阶段"
  //   因为在超长上下文里切阶段 = 一次全量前缀重建（几十万 token 全价），非常贵
  //   设 0 表示关闭闸门
  contextGuardThreshold: 100000,
  // 【修改这里】尾部提示的字数上限（默认 200）。嫌它啰嗦就调到 60~100。
  hintMaxChars: 200,
  // 【修改这里】上下文达到阈值的多少比例时，提前在控制台预警（0 = 关闭）
  contextGuardWarnRatio: 0.8,
  // 【修改这里】★ 迟滞：随口提到的关键词要连续几次指向同一阶段才真的切（1 = 不迟滞）
  //   默认 2，用来挡住"在 Unity 代码任务里顺嘴提了一句界面"这种误切换
  switchConfirmations: 2,
  // 【修改这里】★ 冷却：刚切过一次之后，多少毫秒内不再自动切换（0 = 关闭）
  switchCooldownMs: 120000,
  // 【修改这里】★ 成本闸门：自动切换前先算"几轮能回本"，超过这个轮数就不切
  //   依据：615 条真实记录里，切换成本是双峰的（有时 1%，有时 99%），所以按最坏情况估
  costGateEnabled: true,
  switchPaybackTurns: 3,
  // 【修改这里】演示/调试用：强制假装当前模型是这个名字（用来现场演示降级保护）
  //   例：simulateModel: deepseek-v4-pro  → 立刻触发降级警告，且不花一分钱
  simulateModel: '',
  // 【修改这里】同包另外两个模块的总开关（高级用户可以单独关掉）
  guardEnabled: true, // 连续错误熔断器
  probeEnabled: true, // 缓存探针（想看真实账单就必须开）
  // 两个模块各自的细配置（原样透传，见各自模块顶部的 CONFIG_DEFAULTS）
  guard: {},
  probe: {},
}

const RENDER = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

// 【修改这里】短于这个长度的字符串不送去体检。
// 别设太大：`while(true){}` 只有 13 个字符，设成 20 就会漏掉最短的死循环（实测踩过）。
const MIN_SCAN_CHARS = 8

/** 兜底空流：只在瀑布里拿不到下游 next 时使用，保证不抛错 */
async function* emptyStream() {}

/** 数字兜底：NaN / 字符串 / undefined 一律变 0 */
function toNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * 观察流里的 usage，同时把 chunk 原样透传。
 * 【红线】不消费、不缓存、不改写 —— 一旦包坏了，模型就出不了字。
 * @param {AsyncIterable|Promise<AsyncIterable>} inner
 * @param {(usage:object)=>void} onUsage
 */
async function* observeStream(inner, onUsage) {
  let source = inner
  if (source && typeof source[Symbol.asyncIterator] !== 'function') source = await source
  if (!source || typeof source[Symbol.asyncIterator] !== 'function') return
  for await (const chunk of source) {
    try {
      if (chunk && chunk.type === 'usage' && chunk.usage && typeof onUsage === 'function') onUsage(chunk.usage)
    } catch {
      // 观察失败不影响透传
    }
    yield chunk
  }
}

/** 取会话 key。 */
function keyOf(execOrAgent) {
  if (!execOrAgent || typeof execOrAgent !== 'object') return '__global__'
  const agent = execOrAgent.agent && typeof execOrAgent.agent === 'object' ? execOrAgent.agent : execOrAgent
  if (typeof agent.id === 'string' && agent.id) return agent.id
  return '__global__'
}

/** 配置规范化：脏数据一律回退默认，绝不让插件加载失败。 */
export function normalizeConfig(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const mode = src.lintMode
  const configStages = src.stages && typeof src.stages === 'object' && !Array.isArray(src.stages) ? src.stages : null
  const stages = configStages && Object.keys(configStages).length > 0 ? configStages : DEFAULT_STAGES
  const customStagesFile =
    typeof src.customStagesFile === 'string' && src.customStagesFile.trim()
      ? src.customStagesFile.trim()
      : CONFIG_DEFAULTS.customStagesFile
  const coreTools = Array.isArray(src.coreTools)
    ? src.coreTools.filter((x) => typeof x === 'string' && x)
    : [...DEFAULT_CORE_TOOLS]
  return {
    stages,
    // 【重要】保留"用户在 config 里到底写没写 stages"这个事实。
    // 合并顺序是 内置 → custom_stages.json → config，
    // 分不清的话，合并会把 custom 文件里的阶段又用内置表覆盖回去。
    configStages,
    customStagesFile,
    coreTools,
    contextGuardThreshold:
      Number.isFinite(Number(src.contextGuardThreshold)) && Number(src.contextGuardThreshold) >= 0
        ? Math.trunc(Number(src.contextGuardThreshold))
        : CONFIG_DEFAULTS.contextGuardThreshold,
    switchConfirmations:
      Number.isFinite(Number(src.switchConfirmations)) && Number(src.switchConfirmations) >= 1
        ? Math.trunc(Number(src.switchConfirmations))
        : CONFIG_DEFAULTS.switchConfirmations,
    switchCooldownMs:
      Number.isFinite(Number(src.switchCooldownMs)) && Number(src.switchCooldownMs) >= 0
        ? Math.trunc(Number(src.switchCooldownMs))
        : CONFIG_DEFAULTS.switchCooldownMs,
    costGateEnabled: src.costGateEnabled !== false,
    hintMaxChars:
      Number.isFinite(Number(src.hintMaxChars)) && Number(src.hintMaxChars) >= 40
        ? Math.min(1000, Math.trunc(Number(src.hintMaxChars)))
        : CONFIG_DEFAULTS.hintMaxChars,
    contextGuardWarnRatio:
      Number.isFinite(Number(src.contextGuardWarnRatio)) &&
      Number(src.contextGuardWarnRatio) >= 0 &&
      Number(src.contextGuardWarnRatio) <= 1
        ? Number(src.contextGuardWarnRatio)
        : CONFIG_DEFAULTS.contextGuardWarnRatio,
    switchPaybackTurns:
      Number.isFinite(Number(src.switchPaybackTurns)) && Number(src.switchPaybackTurns) >= 0
        ? Number(src.switchPaybackTurns)
        : CONFIG_DEFAULTS.switchPaybackTurns,
    simulateModel: typeof src.simulateModel === 'string' ? src.simulateModel.trim() : '',
    guardEnabled: src.guardEnabled !== false,
    probeEnabled: src.probeEnabled !== false,
    guard: src.guard && typeof src.guard === 'object' && !Array.isArray(src.guard) ? src.guard : {},
    probe: src.probe && typeof src.probe === 'object' && !Array.isArray(src.probe) ? src.probe : {},
    stageOrder: Array.isArray(src.stageOrder) && src.stageOrder.length > 0 ? src.stageOrder : STAGE_ORDER,
    defaultStage: typeof src.defaultStage === 'string' && stages[src.defaultStage] ? src.defaultStage : 'auto',
    enforceStage: src.enforceStage !== false,
    enforceByRestrict: src.enforceByRestrict === true,
    requireInHistoryUpdates: src.requireInHistoryUpdates !== false,
    unsafeForce: src.unsafeForce === true,
    trustedModels: Array.isArray(src.trustedModels) ? src.trustedModels.filter((x) => typeof x === 'string' && x) : [],
    warnOnDegrade: src.warnOnDegrade !== false,
    lintMode: mode === 'warn' || mode === 'off' ? mode : 'deny',
    lintSkipTools: Array.isArray(src.lintSkipTools) ? src.lintSkipTools.filter((x) => typeof x === 'string') : [...CONFIG_DEFAULTS.lintSkipTools],
    lintMaxArgChars: Number.isFinite(Number(src.lintMaxArgChars)) ? Math.max(2000, Math.trunc(Number(src.lintMaxArgChars))) : CONFIG_DEFAULTS.lintMaxArgChars,
    maxSessions: Number.isFinite(Number(src.maxSessions)) ? Math.max(1, Math.trunc(Number(src.maxSessions))) : CONFIG_DEFAULTS.maxSessions,
  }
}

/** 收集参数里所有长得像文本的值（有界递归，绝不无限展开）。 */
export function collectStrings(value, options = {}) {
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 4
  const maxChars = Number.isFinite(options.maxChars) ? options.maxChars : 200000
  const out = []
  let budget = maxChars

  function walk(node, depth) {
    if (budget <= 0 || depth > maxDepth) return
    if (typeof node === 'string') {
      if (node.length === 0) return
      const take = node.slice(0, budget)
      budget -= take.length
      out.push(take)
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }
    if (node && typeof node === 'object') {
      for (const item of Object.values(node)) walk(item, depth + 1)
    }
  }

  walk(value, 0)
  return out
}

/**
 * 决定探针数据文件的位置（纯函数，好测）。
 *
 * 【坑】别写成 `{ dataFile: 计算值, ...cfg.probe }` —— 配置里 `dataFile: ''`
 * 会把算好的路径覆盖成空串，然后探针就回退到包目录里去了（实测踩过）。
 *
 * @param {{dataFile?:string}} probeConfig
 * @param {string} [stateDir]
 * @returns {string}
 */
export function pickProbeDataFile(probeConfig = {}, stateDir = STATE_DIR) {
  const explicit =
    probeConfig && typeof probeConfig.dataFile === 'string' ? probeConfig.dataFile.trim() : ''
  return explicit || join(stateDir, 'usage.jsonl')
}

/**
 * 探针数据文件：优先用户目录。
 *
 * 老版本把数据写在**包目录内部**（`<包>/data/usage.jsonl`）。
 * link 安装时没感觉，但真实依赖安装时那是个随时会被重装替换的虚拟目录。
 * 所以这里做一次一次性搬家：新位置没有、老位置有 → 复制过去。
 *
 * @param {string} target 新的目标路径
 * @returns {string}
 */
function resolveProbeDataFile(target) {
  try {
    if (existsSync(target)) return target
    const legacy = fileURLToPath(new URL('./data/usage.jsonl', import.meta.url))
    if (!existsSync(legacy)) return target
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(legacy, target)
    console.info(`[minimal-router] 已把探针历史从包目录搬到用户目录：${target}`)
    return target
  } catch {
    return target
  }
}

export function apply(ctx, config = {}) {
  const cfg = normalizeConfig(config)

  // ------------------------------------------------------------------
  // 阶段表三层合并：内置 → custom_stages.json → cordis.patch.yml 里的 stages
  // 后者覆盖前者；custom 文件写坏了就整份忽略并告警（绝不让插件加载失败）
  // ------------------------------------------------------------------
  let customInfo = { found: false, ok: false, stages: {}, errors: [] }
  try {
    customInfo = loadCustomStagesSync(cfg.customStagesFile)
    if (customInfo.found && !customInfo.ok) {
      console.warn(
        `[minimal-router] custom_stages.json 读取失败，已忽略并用回退方案：${customInfo.errors.join('；')}`,
      )
    }
  } catch (error) {
    console.warn(`[minimal-router] custom_stages.json 读取异常：${error && error.message ? error.message : String(error)}`)
  }
  cfg.stages = mergeStages(DEFAULT_STAGES, customInfo.ok ? customInfo.stages : {}, cfg.configStages || {})
  if (!cfg.stages[cfg.defaultStage]) cfg.defaultStage = 'auto'

  const claimed = claimedTags(cfg.stages)
  const state = createStageState({
    stages: cfg.stages,
    defaultStage: cfg.defaultStage,
    order: cfg.stageOrder,
    maxSessions: cfg.maxSessions,
  })
  const skipLint = new Set(cfg.lintSkipTools)
  const registeredAgents = new Set()
  let lastKey = '__global__'
  let lastLintHit = ''

  // ------------------------------------------------------------------
  // ★ 物理瘦身：按阶段用 restrict() 把无关工具从请求里摘掉
  //
  // 【实测踩到的硬约束】restrict() 不允许在插件全局 ctx 上调用，会报：
  //   "tools.restrict() requires a scoped context (agent.ctx):
  //    a context-global restriction would mask every agent"
  // 也就是说 DSH 明确禁止"一刀切所有会话"，必须挂到具体会话的 ctx 上。
  // 所以这里要按会话记住 agent 引用，再在 agent.ctx 上做限制。
  //
  // 【顺序坑】必须先 dispose 旧的限制，再读 schemas() 算新的 deny 列表。
  // 顺序反了就读到"已经被砍过"的旧列表，切回大阶段时工具永远回不来，
  // 直到重载插件。单元测试专门守这一条。
  // ------------------------------------------------------------------
  const agentRefs = new Map() // key → agent（存引用，用于拿 agent.ctx）
  const restrictions = new Map() // key → { dispose, stage, denyCount, visible }
  // 每个会话最近一次请求的真实上下文长度（token），安全闸门用
  const promptTokensBySession = new Map()
  // 已经被闸门拦过的会话（用于"只警告一次"）
  const blockedWarned = new Set()
  // 已经做过"上下文快满了"预警的会话（只提示一次）
  const contextWarned = new Set()
  // 最近一次被拦下的切换（route_status 里展示，方便排查"为什么阶段没变"）
  let lastBlockedSwitch = null
  // 迟滞仲裁器：抑制"顺嘴提一句就切阶段"的抖动
  const switchArbiter = createSwitchArbiter({
    confirmations: cfg.switchConfirmations,
    cooldownMs: cfg.switchCooldownMs,
    maxSessions: cfg.maxSessions,
  })
  // 最近一次仲裁结果（route_status 里展示）
  let lastArbiterDecision = null

  /** 切到某个阶段会摘掉多少字节的工具声明 */
  function deniedBytesForStage(stage) {
    try {
      const schemas = typeof ctx.tools.schemas === 'function' ? ctx.tools.schemas() : []
      const names = schemas.map((t) => (t && typeof t.name === 'string' ? t.name : '')).filter(Boolean)
      const deny = new Set(
        computeDenyList({ toolNames: names, stage, stages: cfg.stages, claimed, coreTools: cfg.coreTools }),
      )
      if (deny.size === 0) return 0
      let bytes = 0
      for (const tool of schemas) {
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

  /** 估算"现在切到这个阶段"的成本 / 收益 / 回本轮数 */
  function estimateForStage(key, stage) {
    const contextTokens = promptTokensBySession.get(key) || 0
    return estimateSwitchEconomy({ contextTokens, deniedBytes: deniedBytesForStage(stage) })
  }

  function rememberAgent(agent) {
    try {
      if (!agent || typeof agent.id !== 'string' || !agent.id) return
      agentRefs.set(agent.id, agent)
      if (agentRefs.size > cfg.maxSessions) {
        const oldest = agentRefs.keys().next().value
        if (oldest !== undefined && oldest !== agent.id) agentRefs.delete(oldest)
      }
    } catch {
      // 静默
    }
  }

  /**
   * 按当前阶段重建该会话的工具限制。
   * @param {string} key 会话 key
   * @param {object} [agentHint] 顺手把 agent 引用记下来
   * @returns {{applied:boolean, reason:string, stage?:string, deny?:number, visible?:number}}
   */
  function refreshRestriction(key, agentHint) {
    if (agentHint && typeof agentHint === 'object') rememberAgent(agentHint)
    if (!cfg.enforceByRestrict) return { applied: false, reason: 'disabled' }

    let stage = 'auto'
    try {
      stage = state.get(key).stage
    } catch {
      return { applied: false, reason: 'state-error' }
    }

    // 【降级】模型不支持 in-history 时，连工具列表都不能动（改它同样会动前缀）
    if (!guard.safe) return { applied: false, reason: 'degraded', stage }

    const current = restrictions.get(key)
    // 阶段没变就不折腾，避免无谓的前缀抖动
    if (current && current.stage === stage) {
      return { applied: false, reason: 'unchanged', stage, deny: current.denyCount, visible: current.visible }
    }

    // 1) 先拆掉旧限制（必须在新列表计算之前）
    if (current) {
      try {
        if (typeof current.dispose === 'function') current.dispose()
      } catch {
        // 拆不掉就继续，最多多一层限制
      }
      restrictions.delete(key)
    }

    // 2) auto 阶段不限
    if (stage === 'auto') return { applied: false, reason: 'auto-stage', stage }

    // 3) 必须拿到会话级 ctx
    const agent = agentRefs.get(key)
    if (!agent) return { applied: false, reason: 'no-agent-context', stage }
    const scopedTools = agent.ctx && agent.ctx.tools
    if (!scopedTools || typeof scopedTools.restrict !== 'function') {
      return { applied: false, reason: 'no-scoped-tools', stage }
    }

    // 4) 用"会话可见的完整工具清单"算 deny
    try {
      const names =
        typeof scopedTools.schemas === 'function'
          ? scopedTools
              .schemas()
              .map((tool) => (tool && typeof tool.name === 'string' ? tool.name : ''))
              .filter(Boolean)
          : []
      const deny = computeDenyList({ toolNames: names, stage, stages: cfg.stages, claimed, coreTools: cfg.coreTools })
      if (deny.length === 0) {
        return { applied: false, reason: 'nothing-to-deny', stage, visible: names.length }
      }
      const dispose = scopedTools.restrict({ deny })
      restrictions.set(key, { dispose, stage, denyCount: deny.length, visible: names.length })
      return { applied: true, reason: 'ok', stage, deny: deny.length, visible: names.length }
    } catch (error) {
      return { applied: false, reason: `error:${error && error.message ? error.message : String(error)}`, stage }
    }
  }

  // 插件卸载时一定要把所有限制拆掉，否则工具会一直处于被砍状态
  ctx.effect(() => () => {
    for (const entry of restrictions.values()) {
      try {
        if (typeof entry.dispose === 'function') entry.dispose()
      } catch {
        // 静默
      }
    }
    restrictions.clear()
  })

  // ------------------------------------------------------------------
  // ★ 降级保护：确认模型支持"系统提示追加到历史"才敢开尾插
  //   判定依据见 lib/model-guard.js 顶部的注释（源码证据 + 推理链）。
  //   关键原则：**不确定就降级**。宁可少省钱，也不能让别人的账单爆炸。
  // ------------------------------------------------------------------
  let guard = {
    safe: false, // 未确认之前一律按不安全处理（fail-safe）
    checked: false,
    provider: '',
    model: '',
    source: '',
    systemPromptUpdate: '',
    reason: '尚未检测到当前模型',
    warned: '', // 已经警告过的 provider/model 组合，避免刷屏
  }

  /** 降级时必须立刻拆掉所有物理限制（否则工具会一直缺一块） */
  function dropRestrictions(reason) {
    for (const entry of restrictions.values()) {
      try {
        if (typeof entry.dispose === 'function') entry.dispose()
      } catch {
        // 静默
      }
    }
    restrictions.clear()
    if (reason) lastLintHit = lastLintHit || ''
  }

  /**
   * 用一次真实请求（或启动时的默认模型）来判定安全性。
   * @param {string} provider
   * @param {string} model
   * @returns {{safe:boolean, reason:string}}
   */
  function evaluateModel(provider, model) {
    const cap = resolveCapability({
      provider,
      model,
      unsafeForce: cfg.unsafeForce,
      requireInHistory: cfg.requireInHistoryUpdates,
      trusted: cfg.trustedModels,
    })
    guard = {
      ...guard,
      safe: cap.safe,
      checked: true,
      provider: provider || '',
      model: model || '',
      source: cap.source,
      systemPromptUpdate: cap.systemPromptUpdate,
      reason: cap.reason,
    }

    if (!cap.safe) {
      // 降级：把已经挂上的物理限制全部拆掉
      dropRestrictions('degraded')
    }

    const key = `${provider || '?'}/${model || '?'}/${cap.safe ? 'ok' : 'degraded'}`
    if (!cap.safe && cfg.warnOnDegrade && guard.warned !== key) {
      guard.warned = key
      console.warn(formatDegradeWarning({ provider, model, reason: cap.reason }))
    }
    // 【别的部署反馈】trustedModels 是"用户断言"，不是实测。断言错了就是每步全价重建，
    // 所以命中白名单时也要说一句，别让用户以为插件验证过。
    if (cap.safe && cap.source === 'trusted' && cfg.warnOnDegrade && guard.warned !== `trusted:${key}`) {
      guard.warned = `trusted:${key}`
      console.warn(
        `[minimal-router] 注意：${model} 是通过 trustedModels 放行的。\n` +
          `  这意味着"尾部提示安全"是**你声明**的，不是插件实测的。\n` +
          `  启用后请聊 3 轮再看 cache_probe_report：如果 prefixChanges 开始增长、hitRate 掉到很低，\n` +
          `  说明这条路由并不支持 in-history —— 请立刻把它从 trustedModels 里删掉。`,
      )
    }
    return { safe: cap.safe, reason: cap.reason }
  }

  // 启动时先试一把：读默认模型，这样第一轮就能决定开不开尾插
  try {
    const selector = typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : undefined
    const selection = selector && typeof selector.currentSelection === 'function' ? selector.currentSelection() : undefined
    const realModel = selection && typeof selection.model === 'string' ? selection.model : ''
    const provider = selection && typeof selection.provider === 'string' ? selection.provider : ''
    // 【演示开关】启动时也要走 simulateModel，否则录视频时第一轮看不到降级
    const model = cfg.simulateModel || realModel
    if (model) evaluateModel(provider, model)
  } catch {
    // 读不到就保持"未确认 = 不安全"，等第一次真实请求再判定
  }

  // 【可选服务】systemPrompt 缺失时，尾插整个跳过，其余功能照常。
  const systemPromptService = optionalService(ctx, 'systemPrompt')
  const hintAvailable = Boolean(systemPromptService && typeof systemPromptService.context === 'function')
  if (!hintAvailable) {
    console.warn(
      '[minimal-router] 当前环境没有提供 systemPrompt 服务：尾部路由提示已禁用，' +
        '但越界拦截 / 死循环体检 / 熔断 / 探针仍然正常工作。',
    )
  }

  /** 生成某个会话的尾部提示文本（每次组装都会调用）。 */
  function hintFor(key) {
    // 【降级】模型不支持 in-history 时，一个字都不注入
    if (!guard.safe) return ''
    // 【降级】没有 systemPrompt 服务时，同样不注入
    if (!hintAvailable) return ''
    try {
      const snapshot = state.get(key)
      return renderHint({ stage: snapshot.stage, stages: cfg.stages, claimed, limit: cfg.hintMaxChars }).text
    } catch {
      return ''
    }
  }

  // ------------------------------------------------------------------
  // 1. 尾插：注册路由提示（全局兜底 + 每会话覆盖）
  //    名字相同 → 会话级的会 shadow 掉全局的，所以不会重复出现两段提示。
  // ------------------------------------------------------------------
  if (hintAvailable) {
    ctx.effect(() =>
      systemPromptService.context({
        name: 'minimal-router:stage',
        order: 950,
        text: () => hintFor(lastKey),
      }),
    )
  }

  /** 给一个具体会话注册专属提示（拿不到 agent.ctx 就跳过，靠全局兜底）。 */
  function registerAgentHint(agent) {
    try {
      if (!agent || typeof agent.id !== 'string' || registeredAgents.has(agent.id)) return
      const agentCtx = agent.ctx
      const systemPrompt = agentCtx && agentCtx.systemPrompt
      if (!systemPrompt || typeof systemPrompt.context !== 'function') return
      systemPrompt.context({
        name: 'minimal-router:stage',
        order: 950,
        text: () => hintFor(agent.id),
      })
      registeredAgents.add(agent.id)
    } catch {
      // 注册不上不影响功能，全局兜底还在
    }
  }

  // ------------------------------------------------------------------
  // 2. 工具 1：route_stage —— 显式切阶段（最高优先级）
  // ------------------------------------------------------------------
  ctx.effect(() =>
    ctx.tools.register({
      name: 'route_stage',
      description:
        '切换当前任务阶段。阶段决定本阶段允许哪些工具组（如 unity_*/ui_*/art_*/meshy_*）。用错组会被拦截，拦截提示里会告诉你该切到哪个阶段。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stage: { type: 'string', description: '阶段名，例如 core / unity-code / unity-ui / art / audio / auto。' },
          force: {
            type: 'boolean',
            description: '上下文超过安全阈值时仍然强行切换（会触发一次全量缓存重建，确认自担风险再用）。',
          },
        },
        required: ['stage'],
      },
      output: RENDER,
      async execute(args, exec) {
        const key = keyOf(exec)
        const wanted = args && typeof args === 'object' && typeof args.stage === 'string' ? args.stage : ''
        const force = Boolean(args && typeof args === 'object' && args.force === true)

        // ---- 安全闸门：超长上下文里切阶段 = 一次全量前缀重建，必须先拦住 ---- //
        const contextTokens = promptTokensBySession.get(key) || 0
        const threshold = cfg.contextGuardThreshold
        if (threshold > 0 && !force && contextTokens > threshold) {
          return {
            ok: false,
            blocked: true,
            stage: state.get(key).stage,
            contextTokens,
            threshold,
            reason:
              `【上下文过大，已阻止切阶段】当前会话已用到 ${contextTokens} token，超过安全阈值 ${threshold}。` +
              `现在切阶段会触发一次全量前缀重建（约 ${contextTokens} token 走全价），非常昂贵。` +
              `请立即停止切换，建议开一个新会话继续；确实要切就调用 route_stage({"stage":"目标阶段","force":true})。`,
          }
        }

        const result = state.setStage(key, wanted)
        if (!result.ok) {
          return { ok: false, stage: state.get(key).stage, error: result.error, available: Object.keys(cfg.stages) }
        }
        const restriction = refreshRestriction(key, exec && exec.agent)
        const economy = estimateForStage(key, result.stage)
        return {
          ok: true,
          stage: result.stage,
          hint: hintFor(key),
          restriction,
          economics: {
            ...economy,
            describe: describeEconomy(economy, cfg.switchPaybackTurns),
          },
        }
      },
    }),
  )

  // ------------------------------------------------------------------
  // 3. 工具 2：route_status —— 看当前状态
  // ------------------------------------------------------------------
  ctx.effect(() =>
    ctx.tools.register({
      name: 'route_status',
      description: '查看路由器的当前状态：当前阶段、可用阶段、工具标签分布、最近一次体检命中。只读。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: RENDER,
      async execute(_args, exec) {
        const key = keyOf(exec)
        const snapshot = state.get(key)
        let catalog = { tags: {}, total: 0 }
        try {
          // 【注意】ctx.tools.schemas() 返回的是"注册表视图"，**不反映 restrict 限制**
          // （实测：限制生效后 schemas() 依然返回 153 条）。
          // 所以这里只报"注册了多少"，真实发出去多少要以 cache_probe_report 为准。
          const schemas = typeof ctx.tools.schemas === 'function' ? ctx.tools.schemas() : []
          catalog = buildCatalog(schemas.map((tool) => tool && tool.name).filter(Boolean), cfg.coreTools)
        } catch {
          // 拿不到工具清单就空着
        }
        const denyCount = (restrictions.get(key) || {}).denyCount || 0
        return {
          stage: snapshot.stage,
          by: snapshot.by,
          explicit: snapshot.explicit,
          defaultStage: cfg.defaultStage,
          enforceStage: cfg.enforceStage,
          lintMode: cfg.lintMode,
          hintLimit: HINT_LIMIT,
          hint: hintFor(key),
          stages: Object.entries(cfg.stages).map(([stageName, definition]) => ({
            stage: stageName,
            title: definition && typeof definition.title === 'string' ? definition.title : stageName,
            allow: definition && Array.isArray(definition.allow) ? definition.allow : [],
          })),
          claimedTags: [...claimed].sort(),
          toolCount: catalog.total,
          // 注册表里有多少个工具（不受限制影响）
          registeredToolCount: catalog.total,
          // 本阶段被物理摘掉多少个
          restrictedToolCount: denyCount,
          // 估算真正发出去多少个（注册数 - 摘掉的数）。以 cache_probe_report 为准
          estimatedAdvertised: Math.max(0, catalog.total - denyCount),
          tagCounts: catalog.tags,
          // 还没被任何阶段管的工具组（新装的插件会出现在这里；它们目前永远放行）
          unclaimedTags: findUnclaimed({ tagCounts: catalog.tags, claimed }),
          // 阶段表和环境对不上？——别人的部署最容易撞的坑：
          // 内置表认领的是 unity/art/...，而这台机器只有 snowluma 之类的标签，
          // 结果 deny 列表永远是空，看起来"装了但一点没省"，而且完全没有任何报错。
          stageTableUnused:
            claimed.size > 0 && ![...claimed].some((tag) => Object.hasOwn(catalog.tags, tag)),
          stageTableHint:
            claimed.size > 0 && ![...claimed].some((tag) => Object.hasOwn(catalog.tags, tag))
              ? '内置阶段表认领的标签在你这里一个都不存在，所以永远不会砍任何工具。请调 route_init 生成模板，或给某个阶段加 strict: true 并写明 allow。'
              : '',
          // 阶段表从哪来的
          stagesSource: {
            customFile: cfg.customStagesFile,
            customFound: customInfo.found === true,
            customOk: customInfo.ok === true,
            customErrors: Array.isArray(customInfo.errors) ? customInfo.errors : [],
            configOverride: Boolean(cfg.configStages),
            totalStages: Object.keys(cfg.stages).length,
          },
          lastLintHit: lastLintHit || '',
          // 【安全闸门】最近一次请求的真实上下文长度 + 闸门是否已经触发
          lastPromptTokens: promptTokensBySession.get(key) || 0,
          contextGuard: {
            threshold: cfg.contextGuardThreshold,
            triggered:
              cfg.contextGuardThreshold > 0 && (promptTokensBySession.get(key) || 0) > cfg.contextGuardThreshold,
            hint: '上下文超过阈值后，切阶段会被拦住（route_stage 需要 force:true 才能强切）',
          },
          // 演示开关当前状态
          simulateModel: cfg.simulateModel,
          // 最近一次"被闸门拦下的切换"（null 表示没拦过）
          lastBlockedSwitch,
          // 迟滞/冷却状态：为什么刚才那句关键词没让阶段变
          switchArbiter: switchArbiter.snapshot(key),
          lastArbiterDecision,
          // 成本闸门：每个阶段"现在切过去"值不值（按最坏情况估）
          switchEconomics: {
            enabled: cfg.costGateEnabled,
            contextTokens: promptTokensBySession.get(key) || 0,
            maxPaybackTurns: cfg.switchPaybackTurns,
            perStage: Object.fromEntries(
              Object.keys(cfg.stages).map((name) => {
                const economy = estimateForStage(key, name)
                const verdict = decideByEconomy({
                  economy,
                  maxPaybackTurns: cfg.switchPaybackTurns,
                  enabled: cfg.costGateEnabled,
                })
                return [name, { ...economy, allow: verdict.allow, reason: verdict.reason }]
              }),
            ),
          },
          enforceByRestrict: cfg.enforceByRestrict,
          // 【降级状态】开源给别人的时候，这两个字段就是"为什么它没生效"的答案
          degraded: !guard.safe,
          degradedReason: guard.safe ? '' : guard.reason,
          modelGuard: {
            checked: guard.checked,
            provider: guard.provider,
            model: guard.model,
            source: guard.source,
            systemPromptUpdate: guard.systemPromptUpdate,
          },
          // 尾插和瘦身是否真的在用（降级时都是 false）
          hintEffective: guard.safe && hintAvailable,
          hintAvailable,
          restrictEffective: cfg.enforceByRestrict && guard.safe,
          restrictedFor: (restrictions.get(key) || {}).stage || '',
          restrictedToolCount: (restrictions.get(key) || {}).denyCount || 0,
        }
      },
    }),
  )

  // ------------------------------------------------------------------
  // 4. 工具 3：route_reset —— 逃生门（永远放行）
  // ------------------------------------------------------------------
  ctx.effect(() =>
    ctx.tools.register({
      name: 'route_reset',
      description: '把当前会话的阶段复位成默认值（auto），解除一切阶段拦截。逃生门，永远不被拦截。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: RENDER,
      async execute(_args, exec) {
        const key = keyOf(exec)
        const before = state.get(key)
        state.reset(key)
        switchArbiter.reset(key)
        lastArbiterDecision = null
        lastLintHit = ''
        const restriction = refreshRestriction(key, exec && exec.agent)
        return {
          reset: true,
          previousStage: before.stage,
          stage: state.get(key).stage,
          restriction,
          message: '已复位到默认阶段，可以继续。',
        }
      },
    }),
  )

  // ------------------------------------------------------------------
  // 4.5 工具 4：route_init —— 生成"你自己领域的"阶段模板
  //   永远放行（在 ALWAYS_ALLOW 里），因为它也是逃生/诊断工具
  // ------------------------------------------------------------------
  ctx.effect(() =>
    ctx.tools.register({
      name: 'route_init',
      description:
        '生成阶段配置。不带参数：扫描当前环境的真实工具，写出一份 custom_stages.sample.json 模板（不会自动加载）。带 preset 参数：直接把内置示例配置写成可用的 custom_stages.json（改完要重载插件）。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          preset: {
            type: 'string',
            description:
              '内置示例之一：python-data / web-dev / writing / qq-chat。给了它就会直接写出可用的 custom_stages.json。',
          },
        },
      },
      output: RENDER,
      async execute(args, exec) {
        // ---- 分支 A：用内置示例，直接写一份能用的配置 ----
        const preset = args && typeof args.preset === 'string' ? args.preset.trim() : ''
        if (preset) {
          const available = listPresets()
          if (!available.includes(preset)) {
            return {
              ok: false,
              error: `没有这个示例：${preset}`,
              presets: available,
            }
          }
          try {
            const text = readFileSync(join(PRESETS_DIR, `${preset}.json`), 'utf8')
            const parsed = JSON.parse(text)
            const checked = validateStagesConfig(parsed)
            if (!checked.ok) {
              return { ok: false, error: `示例自身校验失败：${checked.errors.join('；')}`, presets: available }
            }
            const target = cfg.customStagesFile
            await mkdir(dirname(target), { recursive: true })
            await writeFile(target, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
            return {
              ok: true,
              applied: true,
              preset,
              file: target,
              stages: Object.keys(checked.stages),
              defaultStage: checked.defaultStage || cfg.defaultStage,
              requiresReload: true,
              nextSteps: [
                '1. 到「设置 → 插件」把「极简路由器」关掉再打开（否则跑的还是旧阶段表）',
                '2. 说一句「调 route_status」，确认 stages 里出现了你选的示例阶段',
                '3. 想改成自己的说法：直接编辑上面那个文件里的 keywords',
              ],
            }
          } catch (error) {
            return {
              ok: false,
              error: error && error.message ? error.message : String(error),
              presets: available,
            }
          }
        }

        // ---- 分支 B：扫描环境，生成模板 ----
        let catalog = { tags: {}, total: 0 }
        try {
          const schemas = typeof ctx.tools.schemas === 'function' ? ctx.tools.schemas() : []
          catalog = buildCatalog(schemas.map((tool) => tool && tool.name).filter(Boolean), cfg.coreTools)
        } catch {
          // 拿不到就空着
        }
        const unclaimed = findUnclaimed({ tagCounts: catalog.tags, claimed })
        const template = buildTemplate({
          tagCounts: catalog.tags,
          claimed,
          stages: cfg.stages,
          defaultStage: cfg.defaultStage,
        })
        // 生成到 .sample.json：故意不叫 custom_stages.json，
        // 免得用户没看就生效（阶段配错会拦人，比不配更糟）
        const target = cfg.customStagesFile.replace(/custom_stages\.json$/i, 'custom_stages.sample.json')
        let written = false
        let writeError = ''
        try {
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, `${JSON.stringify(template, null, 2)}\n`, 'utf8')
          written = true
        } catch (error) {
          writeError = error && error.message ? error.message : String(error)
        }
        return {
          written,
          file: target,
          writeError,
          toolCount: catalog.total,
          unclaimedCount: unclaimed.length,
          unclaimed,
          nextSteps: [
            '1. 打开上面这个 .sample.json 文件',
            '2. 把 suggestions 里需要的条目搬进 stages，并改成你平时说的话',
            '3. 另存为 custom_stages.json（去掉 .sample）',
            '4. 在「设置 → 插件」里把「极简路由器」关掉再打开',
            '5. 用 route_status 确认 claimedTags 里出现了你的新标签',
          ],
        }
      },
    }),
  )

  // ------------------------------------------------------------------
  // 5. 铁血拦截：写代码前体检 + 阶段越界判定
  // ------------------------------------------------------------------
  ctx.on('tools/pre-execute', (...args) => {
    const next = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null
    const exec = args[0]

    try {
      const toolName = exec && typeof exec.name === 'string' ? exec.name : ''

      // 逃生门：永远放行，连体检都不做（否则逃生门自己也可能被拦）
      if (!ALWAYS_ALLOW.includes(toolName)) {
        // ---- 5.1 本地体检 ----
        if (cfg.lintMode !== 'off' && toolName && !skipLint.has(toolName)) {
          const texts = collectStrings(exec && exec.arguments, { maxChars: cfg.lintMaxArgChars })
          for (const text of texts) {
            if (text.length < MIN_SCAN_CHARS) continue
            const { findings } = scanCode(text)
            const blocks = findings.filter((f) => f.severity === 'block')
            if (blocks.length === 0) continue
            const reason = formatFindings(blocks, `工具 ${toolName}`)
            lastLintHit = reason
            if (cfg.lintMode === 'deny') {
              return { kind: 'deny', reason, info: { name: 'minimal-router', code: 'LINT_DEAD_LOOP' } }
            }
            // warn 模式：只记不拦
            console.warn(`[minimal-router] ${reason}`)
            break
          }
        }

        // ---- 5.2 阶段越界 ----
        if (cfg.enforceStage && toolName) {
          const key = keyOf(exec)
          lastKey = key
          const snapshot = state.get(key)
          const verdict = decideOutOfStage({ toolName, stage: snapshot.stage, stages: cfg.stages, claimed, coreTools: cfg.coreTools })
          if (!verdict.allow) {
            return { kind: 'deny', reason: verdict.reason, info: { name: 'minimal-router', code: 'STAGE_DENIED' } }
          }
        }
      }
    } catch {
      // 插件自己算错了 → 放行，宁可少拦一次也不能堵死用户
    }

    return next ? next() : { kind: 'allow' }
  })

  // ------------------------------------------------------------------
  // 6. 用户发新消息 → 重新判定阶段（关键词）
  // ------------------------------------------------------------------
  // ============================================================================
  // 10.5 关键词自动切阶段 —— 同样要过安全闸门
  //
  // 【实测踩的坑】原先只有 route_stage 过闸门，关键词这条路没拦。
  // 结果在 78 万 token 的会话里，用户随口一句"切到 core 阶段"，
  // 关键词命中 → 阶段变了 → 工具表变了 → 一次 51.4 万 token 的全量重建（命中率 1.2%）。
  // 也就是说：**闸门漏了一条路，等于没装。**
  // ============================================================================
  ctx.on('agent/inbox/claimed', (payload) => {
    try {
      const key = keyOf(payload && payload.agent)
      lastKey = key
      const text = textOfMessage(payload && payload.message)
      const threshold = cfg.contextGuardThreshold
      const contextTokens = promptTokensBySession.get(key) || 0
      const detected = detectStage(text, cfg.stages, cfg.stageOrder)
      const current = state.get(key).stage

      // ---- 闸门 1：上下文过大时，任何"会改工具表"的切换都要拦 ----
      if (threshold > 0 && contextTokens > threshold && detected && detected !== current) {
        // 只记账、不切换：保持当前阶段，避免又一次全量重建
        lastBlockedSwitch = {
          at: Date.now(),
          by: 'keyword',
          from: current,
          to: detected,
          contextTokens,
          threshold,
        }
        if (!blockedWarned.has(key)) {
          blockedWarned.add(key)
          console.warn(
            `[minimal-router] 已阻止一次"关键词自动切阶段"（${current} → ${detected}）：` +
              `当前会话 ${contextTokens} token 超过安全阈值 ${threshold}，切了会全量重建缓存。` +
              `要强制切换请用 route_stage({"stage":"${detected}","force":true})，或开新会话。`,
          )
        }
        return
      }

      // ---- 闸门 2：成本闸门（自动切换前，先算几轮能回本）----
      // 【注意】显式命令（"切到美术阶段"）跳过这一层：用户亲口要求的，不该被经济账拦。
      if (cfg.costGateEnabled && !isExplicitSwitch(text) && detected && detected !== current) {
        const economy = estimateForStage(key, detected)
        const verdict = decideByEconomy({
          economy,
          maxPaybackTurns: cfg.switchPaybackTurns,
          enabled: true,
        })
        if (!verdict.allow) {
          lastBlockedSwitch = {
            at: Date.now(),
            by: 'cost-gate',
            from: current,
            to: detected,
            contextTokens,
            estimatedCost: economy.costTokens,
            savePerTurn: economy.savePerTurnTokens,
            paybackTurns: economy.paybackTurns,
            reason: verdict.reason,
          }
          if (!blockedWarned.has(`${key}|cost`)) {
            blockedWarned.add(`${key}|cost`)
            console.warn(
              `[minimal-router] 已阻止一次"自动切阶段"（${current} → ${detected}）：${describeEconomy(economy, cfg.switchPaybackTurns)}` +
                ` 显式切换仍可用 route_stage。`,
            )
          }
          return
        }
      }

      // ---- 闸门 3：迟滞 + 冷却（抑制"顺嘴提一句就切"的抖动）----
      if (detected && detected !== current) {
        const decision = switchArbiter.decide({ key, detected, explicit: isExplicitSwitch(text) })
        if (!decision.switch) {
          // 不切：传空文本让状态机走"粘住"分支（保持当前阶段），只把信号记账
          state.onUserMessage(key, '')
          lastArbiterDecision = { at: Date.now(), key, from: current, to: detected, ...decision }
          return
        }
        lastArbiterDecision = { at: Date.now(), key, from: current, to: detected, ...decision }
        state.onUserMessage(key, text)
        switchArbiter.noteSwitched({ key })
        refreshRestriction(key, payload && payload.agent)
        return
      }

      state.onUserMessage(key, text)
      // 关键词可能把阶段换了 → 工具列表也要跟着换（只在真变了时才动）
      refreshRestriction(key, payload && payload.agent)
    } catch {
      // 静默
    }
  })

  // ------------------------------------------------------------------
  // 8. 模型能力检测：每次真实请求都看一眼用的是什么模型
  //
  // 为什么用 llm/stream：它是"每一次模型调用"都会过的瀑布流，
  // 包括主会话、子智能体、压缩请求……是最全的采样点。
  //
  // 【重要】这里只是"旁听"，绝不改变流的内容：把下游的 iterable 原样返回。
  // 不消费、不包装、不 await —— 一旦包坏了，模型就出不了字了。
  // ------------------------------------------------------------------
  ctx.on('llm/stream', (...args) => {
    const next = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null
    const options = args[0]
    try {
      if (options && typeof options === 'object') {
        const provider = typeof options.provider === 'string' ? options.provider : ''
        // 【演示开关】simulateModel 可以让插件"以为"自己在用别的模型，用来录降级演示
        const model = cfg.simulateModel || (typeof options.model === 'string' ? options.model : '')
        if (model) evaluateModel(provider, model)
      }
    } catch {
      // 检测失败绝不影响请求
    }

    const key = options && typeof options.sessionId === 'string' && options.sessionId ? options.sessionId : '__global__'
    return observeStream(next ? next() : emptyStream(), (usage) => {
      try {
        const total = toNum(usage.inputTokens) + toNum(usage.cacheReadTokens)
        if (total > 0) {
          promptTokensBySession.set(key, total)
          if (promptTokensBySession.size > cfg.maxSessions) {
            const oldest = promptTokensBySession.keys().next().value
            if (oldest !== undefined && oldest !== key) promptTokensBySession.delete(oldest)
          }
          // 【提前预警】别等用户真想切阶段才拒绝他。
          // 到阈值的一定比例就提示"该开新会话了"，这条只写控制台、不动 prompt，零成本。
          const warnRatio = cfg.contextGuardWarnRatio
          const threshold = cfg.contextGuardThreshold
          if (warnRatio > 0 && threshold > 0 && total >= threshold * warnRatio && !contextWarned.has(key)) {
            contextWarned.add(key)
            console.warn(
              `[minimal-router] 上下文已达 ${total} token（阈值的 ${Math.round((total / threshold) * 100)}%）。\n` +
                `  再涨下去，"切阶段"会被安全闸门拒绝——因为那会触发一次全量前缀重建。\n` +
                `  建议现在开一个新会话继续，把这块上下文留在原地。`,
            )
          }
        }
      } catch {
        // 静默
      }
    })
  })

  // ------------------------------------------------------------------
  // 10. 新会话 → 注册会话级尾插
  // ------------------------------------------------------------------
  ctx.on('agent/created', (payload) => {
    try {
      registerAgentHint(payload && payload.agent)
    } catch {
      // 静默
    }
  })

  // ------------------------------------------------------------------
  // 11. 装配同包的另外两个模块（一个包、一次安装、一份配置）
  //
  // 为什么合成一个包：装一次插件 = 重载一次 = 一次全量前缀重建。
  // 三个独立包 = 最多三次重建（实测一次 51 万 token 全价），小白受不了。
  //
  // 任何一个模块挂了都不影响其它两个：各自 try/catch，只告警不抛错。
  // ------------------------------------------------------------------
  if (cfg.guardEnabled) {
    try {
      applyGuard(ctx, cfg.guard)
    } catch (error) {
      console.warn(`[minimal-router] 熔断模块加载失败（路由功能不受影响）：${error && error.message ? error.message : String(error)}`)
    }
  }
  if (cfg.probeEnabled) {
    try {
      // 探针数据放在用户目录（包外面）；显式配置了 dataFile 就尊重它
      const probeConfig = {
        ...cfg.probe,
        dataFile: resolveProbeDataFile(pickProbeDataFile(cfg.probe)),
      }
      applyProbe(ctx, probeConfig)
    } catch (error) {
      console.warn(`[minimal-router] 探针模块加载失败（路由功能不受影响）：${error && error.message ? error.message : String(error)}`)
    }
  }
}
