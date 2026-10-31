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
  suggestStageForTag,
  tagBytesOf,
} from './lib/classify.js'
import { createStageState, textOfMessage, detectStage, isExplicitSwitch, createSwitchArbiter } from './lib/stage.js'
import { setUnionEnabled } from './lib/union.js'
import { createIntentDetector } from './lib/intent.js'
import { createUsageTracker } from './lib/usage.js'
import { createSignalStore } from './lib/adaptive.js'
import { STATE_DIR, collectStrings, pickProbeDataFile, RENDER, toNum } from './lib/util.js'
import { createActivityLog } from './lib/activity.js'
import { createFeedback } from './lib/feedback.js'

// 这些符号历史上由 index.js 导出，测试和外部用户可能直接 import —— 保持兼容
export { STATE_DIR, collectStrings, pickProbeDataFile }
import { estimateSwitchEconomy, decideByEconomy, describeEconomy, measureDeniedBytes } from './lib/cost.js'
import { registerDynamicTools } from './lib/tools-dynamic.js'
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
  listPresets,
  readPreset,
} from './lib/stages-config.js'
import { fileURLToPath } from 'node:url'

// 内置示例的实现在 lib/stages-config.js（避免 index.js 继续膨胀），这里只是对外重新导出
export { listPresets }
import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

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
// 阶段定义搬到了 lib/stages-default.js（纯数据，给入口文件腾行数）
// 想加阶段/改关键词去那里改；这里保留 re-export 兼容老引用。
// ============================================================================
import { DEFAULT_STAGES, STAGE_ORDER } from './lib/stages-default.js'
export { DEFAULT_STAGES }

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
  // 【修改这里】尾部路由提示总开关（route_hint 可在运行时改，方便 A/B）
  hintEnabled: true,
  // 【修改这里】尾部提示的字数上限（默认 200）。嫌它啰嗦就调到 60~100。
  hintMaxChars: 200,
  // 【修改这里】上下文达到阈值的多少比例时，提前在控制台预警（0 = 关闭）
  contextGuardWarnRatio: 0.8,
  // 【修改这里】★ 累积披露：某一组工具在本会话里一旦露过面，就保持可见（不再收回）
  //   true  = 工具表只会变大不会变小 → 切换的差异更小、缓存更稳，但瘦身效果打折
  //   false = 严格按当前阶段裁剪（默认）
  accumulateDisclosure: false,
  // 【修改这里】★ 迟滞：随口提到的关键词要连续几次指向同一阶段才真的切（1 = 不迟滞）
  //   默认 2，用来挡住"在 Unity 代码任务里顺嘴提了一句界面"这种误切换
  switchConfirmations: 2,
  // 【修改这里】★ 冷却：刚切过一次之后，多少毫秒内不再自动切换（0 = 关闭）
  //   默认 60 秒 —— 从 88 次真实切换的间隔里量的：71% 的相邻切换发生在 60 秒内
  switchCooldownMs: 60000,
  // 【修改这里】★ 裁剪模式：'deny'（默认，摘掉不要的）/ 'allow'（只留要的）
  //   deny 的问题是它依赖"注册表有多大"：A/B 实测按 138 算 deny=100，作用在 172 的全局表上，
  //   结果剩 72 而不是 38。allow 模式不关心总数，只留点名的，结果可预测。
  //   默认仍是 deny（保守），想更确定就切 allow —— 两种模式都能被 A/B 验证。
  restrictMode: 'deny',
  // 【修改这里】★ 时间窗：两次关键词信号相隔超过这个毫秒数，就当新任务重新计数
  //   默认 5 分钟 —— 大于实测 P75（81 秒），让同一段对话里的连续提到能累加
  switchConfirmWindowMs: 300000,
  // 【修改这里】★ 成本闸门：自动切换前先算"几轮能回本"，超过这个轮数就不切
  //   依据：615 条真实记录里，切换成本是双峰的（有时 1%，有时 99%），所以按最坏情况估
  costGateEnabled: true,
  switchPaybackTurns: 3,
  // 【修改这里】保守系数：重建成本按"上下文 × 这个比例"估
  //   1.0 = 最坏情况（整段全价，默认，最安全）；实测平均值只有 0.465，调低更激进
  switchCostRatio: 1.0,
  // 【修改这里】每字节工具声明折算多少 token（实测 98,778 字节 ≈ 29,800 token）
  switchSavingsPerByte: 0.3,
  // 【修改这里】演示/调试用：强制假装当前模型是这个名字（用来现场演示降级保护）
  //   例：simulateModel: deepseek-v4-pro  → 立刻触发降级警告，且不花一分钱
  simulateModel: '',
  // 【修改这里】★ 语义打分路由：关键词没命中时，用本地字符统计再猜一次
  //   零额外请求（不调模型），猜不准就返回 null，退回"粘住当前阶段"
  //   minScore 越低越激进；minMargin 是"领先第二名的比例"，防平票乱切
  intentRouting: true,
  intentMinScore: 2.0,
  intentMinMargin: 0.25,
  // 【修改这里】★ @experimental 多领域并集：默认 false（关闭）
  //   实测：并集阶段发出的工具声明 ≈ 单阶段的 3 倍（154 工具/134,539 字节 vs 54/46,326），
  //   对主打"瘦身"的插件来说多数任务是负收益。仅当你要做"复合任务"时显式设为 true。
  //   关闭时 detectStage / 打分器都不会产出 "a+b"，行为与引入并集前完全一致。
  unionEnabled: false,
  // 【修改这里】★ 使用画像：记录每个工具被调用过几次，找出"从没用过"的那些
  //   只统计、不卸载；数据写在 ~/.dsh/minimal-router/tool-usage.json
  usageTracking: true,
  // 【修改这里】★ 自适应阶段：从"最近真的调用了哪些工具组"里学，自动切阶段
  //   默认关闭 —— 它会自动改工具表，而切一次可能要付整段前缀的重建成本
  //   打开后仍然要过：成本闸门 + 迟滞（不会一次命中就切）
  adaptiveStage: false,
  adaptiveWindow: 20, // 看最近多少次工具调用
  adaptiveMinCalls: 6, // 至少命中这么多次才敢动
  adaptiveMinShare: 0.6, // 且要占到 60% 以上
  // 【修改这里】★ 智能开关：只在"回本划算"的时候真的物理瘦身
  //   小会话（重建便宜）照常瘦；大会话（重建贵）只提示不瘦，避免白付一次全量重建
  //   显式 route_stage 不受影响
  autoRestrictPolicy: true,
  // 【修改这里】同包另外两个模块的总开关（高级用户可以单独关掉）
  guardEnabled: true, // 连续错误熔断器
  probeEnabled: true, // 缓存探针（想看真实账单就必须开）
  // 两个模块各自的细配置（原样透传，见各自模块顶部的 CONFIG_DEFAULTS）
  guard: {},
  probe: {},
}

// 【修改这里】短于这个长度的字符串不送去体检。
// 别设太大：`while(true){}` 只有 13 个字符，设成 20 就会漏掉最短的死循环（实测踩过）。
const MIN_SCAN_CHARS = 8

/** 兜底空流：只在瀑布里拿不到下游 next 时使用，保证不抛错 */
async function* emptyStream() {}

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
// 【多 Agent 隔离】匿名 agent（没有 id）用 WeakMap 各给一个唯一键，
// 绝不共用 '__global__'——否则两个窗口的状态会互相覆盖（A 切阶段把 B 的工具砍了）。
const anonKeys = new WeakMap()
let anonSeq = 0

function keyOf(execOrAgent) {
  if (!execOrAgent || typeof execOrAgent !== 'object') return '__global__'
  const agent = execOrAgent.agent && typeof execOrAgent.agent === 'object' ? execOrAgent.agent : execOrAgent
  if (typeof agent.id === 'string' && agent.id) return agent.id
  if (agent && typeof agent === 'object') {
    let assigned = anonKeys.get(agent)
    if (!assigned) {
      anonSeq += 1
      assigned = `__anon_${anonSeq}`
      anonKeys.set(agent, assigned)
    }
    return assigned
  }
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
    switchConfirmWindowMs:
      Number.isFinite(Number(src.switchConfirmWindowMs)) && Number(src.switchConfirmWindowMs) >= 0
        ? Math.trunc(Number(src.switchConfirmWindowMs))
        : CONFIG_DEFAULTS.switchConfirmWindowMs,
    switchCostRatio:
      Number.isFinite(Number(src.switchCostRatio)) && Number(src.switchCostRatio) >= 0
        ? Number(src.switchCostRatio)
        : CONFIG_DEFAULTS.switchCostRatio,
    switchSavingsPerByte:
      Number.isFinite(Number(src.switchSavingsPerByte)) && Number(src.switchSavingsPerByte) >= 0
        ? Number(src.switchSavingsPerByte)
        : CONFIG_DEFAULTS.switchSavingsPerByte,
    costGateEnabled: src.costGateEnabled !== false,
    accumulateDisclosure: src.accumulateDisclosure === true,
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
    intentRouting: src.intentRouting !== false,
    usageTracking: src.usageTracking !== false,
    adaptiveStage: src.adaptiveStage === true,
    autoRestrictPolicy: src.autoRestrictPolicy !== false,
    adaptiveWindow:
      Number.isFinite(Number(src.adaptiveWindow)) && Number(src.adaptiveWindow) >= 3
        ? Math.trunc(Number(src.adaptiveWindow))
        : CONFIG_DEFAULTS.adaptiveWindow,
    adaptiveMinCalls:
      Number.isFinite(Number(src.adaptiveMinCalls)) && Number(src.adaptiveMinCalls) >= 1
        ? Math.trunc(Number(src.adaptiveMinCalls))
        : CONFIG_DEFAULTS.adaptiveMinCalls,
    adaptiveMinShare:
      Number.isFinite(Number(src.adaptiveMinShare)) && Number(src.adaptiveMinShare) > 0 && Number(src.adaptiveMinShare) <= 1
        ? Number(src.adaptiveMinShare)
        : CONFIG_DEFAULTS.adaptiveMinShare,
    // @experimental 多领域并集：默认关闭，只有严格 true 才开
    unionEnabled: src.unionEnabled === true,
    intentMinScore:
      Number.isFinite(Number(src.intentMinScore)) && Number(src.intentMinScore) >= 0
        ? Number(src.intentMinScore)
        : CONFIG_DEFAULTS.intentMinScore,
    intentMinMargin:
      Number.isFinite(Number(src.intentMinMargin)) && Number(src.intentMinMargin) >= 0 && Number(src.intentMinMargin) <= 1
        ? Number(src.intentMinMargin)
        : CONFIG_DEFAULTS.intentMinMargin,
    guardEnabled: src.guardEnabled !== false,
    probeEnabled: src.probeEnabled !== false,
    guard: src.guard && typeof src.guard === 'object' && !Array.isArray(src.guard) ? src.guard : {},
    probe: src.probe && typeof src.probe === 'object' && !Array.isArray(src.probe) ? src.probe : {},
    stageOrder: Array.isArray(src.stageOrder) && src.stageOrder.length > 0 ? src.stageOrder : STAGE_ORDER,
    defaultStage: typeof src.defaultStage === 'string' && stages[src.defaultStage] ? src.defaultStage : 'auto',
    enforceStage: src.enforceStage !== false,
    enforceByRestrict: src.enforceByRestrict === true,
    restrictMode: src.restrictMode === 'allow' ? 'allow' : 'deny',
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
  // @experimental 并集开关：必须在任何 detectStage / 打分器被调用之前设置
  setUnionEnabled(cfg.unionEnabled)

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
  // 语义打分器：画像只建一次；猜不准返回 null，调用方就退回"粘住"
  const intentDetector = cfg.intentRouting
    ? createIntentDetector(cfg.stages, { minScore: cfg.intentMinScore, minMargin: cfg.intentMinMargin })
    : null
  let lastIntent = null
  // 使用画像：内存计数 + 定时落盘（落盘失败不影响主流程）
  const usage = createUsageTracker({ file: join(STATE_DIR, 'tool-usage.json') })
  // 活动日志：记录"它实际做了什么"（切了什么、拦了谁），供 route_activity 查看
  const activity = createActivityLog({ file: join(STATE_DIR, 'activity.jsonl') })
  // 自适应信号：每个会话一个滑动窗口（只看最近 N 次真实调用）
  const signals = createSignalStore({ size: cfg.adaptiveWindow, max: cfg.maxSessions })
  let lastAdaptive = null
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
  // 【累积披露】key → 本会话里"已经露过面"的标签集合
  const disclosedTags = new Map()
  // 【任务驱动】key → { groups:Set, remainingTurns, createdAt } 临时收窄工具面
  const dynamicGrants = new Map()
  // 【B/C】建议 + 拦截回收：状态在 lib/feedback.js，这里只管接线
  const feedback = createFeedback()
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
    confirmWindowMs: cfg.switchConfirmWindowMs,
    maxSessions: cfg.maxSessions,
  })
  // 最近一次仲裁结果（route_status 里展示）
  let lastArbiterDecision = null

  /** 切到某个阶段会摘掉多少字节的工具声明（实现在 lib/cost.js） */
  function deniedBytesForStage(stage) {
    const schemas = typeof ctx.tools.schemas === 'function' ? ctx.tools.schemas() : []
    return measureDeniedBytes(schemas, stage, {
      stages: cfg.stages,
      claimed,
      coreTools: cfg.coreTools,
      computeDenyList,
    })
  }

  /** 估算"现在切到这个阶段"的成本 / 收益 / 回本轮数 */
  function estimateForStage(key, stage) {
    const contextTokens = promptTokensBySession.get(key) || 0
    return estimateSwitchEconomy({
      contextTokens,
      deniedBytes: deniedBytesForStage(stage),
      tokensPerByte: cfg.switchSavingsPerByte,
      rebuildRatio: cfg.switchCostRatio,
    })
  }

  /**
   * 【P1】阶段表和环境对不上时，主动喊一声。
   *
   * 以前这个信息只在 route_status 里——用户不问就永远不知道自己在"白装"。
   * 现在只要第一次出现"没什么可砍"，就检查一次并提醒（只提醒一次）。
   */
  let stageTableWarned = false
  function warnIfStageTableUnused(names) {
    if (stageTableWarned) return
    try {
      const catalog = buildCatalog(names, cfg.coreTools)
      if ([...claimed].some((tag) => Object.hasOwn(catalog.tags, tag))) return
      stageTableWarned = true
      console.warn(
        '[minimal-router] 当前阶段表认领的标签，在这台机器上一个都不存在 → 永远砍不掉任何工具（看起来装了，其实 0 收益）。\n' +
          '  三种解法：\n' +
          '   1) route_init({"preset":"python-data"}) 直接用内置示例（还有 web-dev / writing / qq-chat）\n' +
          '   2) route_init            扫描你真实环境，生成待编辑的模板\n' +
          '   3) 给某个阶段加 "strict": true，然后写明 allow —— 连未分类的标签也会一起拒绝',
      )
    } catch {
      // 算不出来就算了，别打扰用户
    }
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
    // 【任务驱动】本会话有动态收窄授权时，它优先于阶段规则
    const grant = dynamicGrants.get(key)
    const grantGroups = grant && grant.groups && grant.groups.size > 0 ? grant.groups : null
    // 裁剪模式也进签名：deny/allow 互换时必须重新算一次，否则会因为"签名没变"被跳过
    const restrictMode = cfg.restrictMode === 'allow' ? 'allow' : 'deny'
    const signature = `${restrictMode}:${grantGroups ? `dyn:${[...grantGroups].sort().join(',')}` : `stage:${stage}`}`
    // 签名没变就不折腾，避免无谓的前缀抖动
    if (current && current.signature === signature) {
      return {
        applied: false,
        reason: 'unchanged',
        stage,
        signature,
        deny: current.denyCount,
        visible: current.visible,
      }
    }

    // 【A · 智能开关】只在"划算"的时候真的瘦身
    //   重建成本 ≈ 当前上下文全价；每轮收益 ≈ 被摘掉那部分工具声明的 token
    //   回本超过 switchPaybackTurns 就不瘦：省不了钱，还白付一次重建
    //   显式 route_stage 不拦（用户亲口要求的，照办）
    if (cfg.autoRestrictPolicy && stage !== 'auto' && !state.get(key).explicit) {
      try {
        const economy = estimateForStage(key, stage)
        const verdict = decideByEconomy({
          economy,
          maxPaybackTurns: cfg.switchPaybackTurns,
          enabled: true,
        })
        if (!verdict.allow) {
          activity.log('restrict', { stage, skipped: verdict.reason, payback: economy.paybackTurns })
          return {
            applied: false,
            reason: `policy:${verdict.reason}`,
            stage,
            paybackTurns: economy.paybackTurns,
            savePerTurn: economy.savePerTurnTokens,
            hint: '不划算：重建成本还没赚回来，先只提示不瘦身',
          }
        }
      } catch {
        // 算不出来就照常瘦（保守：宁可省不了，也别因为算错而不动）
      }
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

    // 2) auto 阶段不限（但显式的动态收窄优先）
    if (!grantGroups && stage === 'auto') return { applied: false, reason: 'auto-stage', stage }

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
      let deny
      if (grantGroups) {
        // 【任务驱动】只留这组 + core + 逃生门，其余全摘
        const allowed = new Set([...grantGroups, 'core'])
        deny = names.filter((name) => {
          if (ALWAYS_ALLOW.includes(name)) return false
          return !allowed.has(tagOf(name, cfg.coreTools))
        })
      } else {
        deny = computeDenyList({ toolNames: names, stage, stages: cfg.stages, claimed, coreTools: cfg.coreTools })
      }

      // 【累积披露】本会话里已经露过面的组，不再收回。
      // 好处：工具表只会变大不会变小 → 每次切换的差异更小，前缀缓存更稳。
      // 代价：瘦身效果随会话变长而衰减（所以默认关闭，由用户显式打开）。
      if (cfg.accumulateDisclosure) {
        const seen = disclosedTags.get(key) || new Set()
        if (deny.length > 0) {
          const deniedSet = new Set(deny)
          deny = deny.filter((name) => !seen.has(tagOf(name, cfg.coreTools)))
          // 这一步"白露了"的工具，其标签同样算已披露
          for (const name of names) if (!deniedSet.has(name)) seen.add(tagOf(name, cfg.coreTools))
        } else {
          for (const name of names) seen.add(tagOf(name, cfg.coreTools))
        }
        disclosedTags.set(key, seen)
      }

      if (deny.length === 0) {
        warnIfStageTableUnused(names)
        return { applied: false, reason: 'nothing-to-deny', stage, visible: names.length }
      }

      // 【两种裁剪模式】
      //   deny  ：把不要的摘掉 —— 依赖"注册表有多大"，实测会算错（38 vs 实际 72）
      //   allow ：只留要的 —— 不关心总数，结果天然可预测
      // 两者都受 restrict() 的约束：名字必须是已知的全局工具，且不能是保留名 run_code。
      const mode = restrictMode
      let dispose
      if (mode === 'allow') {
        const deniedSet = new Set(deny)
        const allow = names.filter((name) => !deniedSet.has(name) && name !== 'run_code')
        // 一个都不留是很危险的（等于把工具全藏了）；这种情况下退回 deny，至少语义清楚
        dispose = allow.length > 0 ? scopedTools.restrict({ allow }) : scopedTools.restrict({ deny: names })
      } else {
        dispose = scopedTools.restrict({ deny: deny.filter((name) => name !== 'run_code') })
      }

      // 【A/B 三轮实测后的更正】deny 列表按本会话注册表算，restrict() 却作用在更大的共享表上：
      // 注册表 138、deny=100，请求里实际剩 172-100=72。
      // 我试过"restrict 之后重新读 scopedTools.schemas()"来自证，结果仍然是 138——
      // **那个接口不反映限制**。所以这里不再对外报"剩多少"，
      // 唯一权威的数字是 cache_probe_report 里的 tools / toolsChars。
      restrictions.set(key, {
        dispose,
        stage,
        signature,
        mode,
        denyCount: deny.length,
        visible: names.length,
      })
      activity.log('restrict', { stage, mode, deny: deny.length })
      return {
        applied: true,
        reason: 'ok',
        stage,
        signature,
        mode,
        deny: deny.length,
        visible: names.length,
        // 【不报"还剩多少"】三轮 A/B 证明：减法估（38）和 scoped schemas（138）都不等于
        // 真实发出去的数（72）。唯一权威的是 cache_probe_report 的 tools/toolsChars。
      }
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
    reason: 'current model not detected yet',
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
      activity.log('degrade', { model: model || '?', reason: cap.reason })
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
  // 运行时开关（全局配置的总闸）
  let hintRuntime = cfg.hintEnabled !== false
  // 【A/B】按会话单独关掉提示 —— 否则做实验会把别的会话的前缀也改动
  const hintOffSessions = new Set()
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
    // 【A/B】运行时被关掉时也不注入（全局总闸 + 本会话单独关）
    if (!hintRuntime) return ''
    if (hintOffSessions.has(key)) return ''
    try {
      const snapshot = state.get(key)
      // 【B · 主动建议】只在 auto 阶段给建议（已经在阶段里，就别再添噪音）
      const sug = feedback.getSuggestion(key)
      const suffix =
        snapshot.stage === 'auto' && sug && sug.stage && Date.now() - sug.at < 5 * 60 * 1000
          ? `Tip: looks like ${sug.stage}; if so, route_use(["${sug.tag}"],3).`
          : ''
      return renderHint({
        stage: snapshot.stage,
        stages: cfg.stages,
        claimed,
        limit: cfg.hintMaxChars,
        suffix,
      }).text
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
        'Switch the stage for the current task. A stage decides which tool groups are available (e.g. unity_*/ui_*/art_*/meshy_*). Calling a tool from a disallowed group is blocked, and the block message tells you which stage to switch to.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stage: { type: 'string', description: 'Stage name, e.g. core / unity-code / unity-ui / art / audio / auto.' },
          force: {
            type: 'boolean',
            description: 'Switch even when the context exceeds the safety threshold (triggers a full-price prefix rebuild — use only if you accept the cost).',
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
        // 切阶段就取消任务驱动的临时收窄，免得两套规则互相盖住
        dynamicGrants.delete(key)
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
      description:
        'Read the router state: current stage, available stages, tool-group distribution, the last lint hit, and whether trimming is actually effective. Read-only.',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: RENDER,
      async execute(_args, exec) {
        const key = keyOf(exec)
        const snapshot = state.get(key)
        let catalog = { tags: {}, total: 0 }
        let registeredNames = []
        // 标签 → 字节数：给"未认领标签"做体积归因（人类据此决定要不要写 custom_stages.json）
        let tagBytes = {}
        try {
          // 【注意】ctx.tools.schemas() 返回的是"注册表视图"，**不反映 restrict 限制**
          // （实测：限制生效后 schemas() 依然返回 153 条）。
          // 所以这里只报"注册了多少"，真实发出去多少要以 cache_probe_report 为准。
          const schemas = typeof ctx.tools.schemas === 'function' ? ctx.tools.schemas() : []
          registeredNames = schemas.map((tool) => tool && tool.name).filter(Boolean)
          catalog = buildCatalog(registeredNames, cfg.coreTools)
          tagBytes = tagBytesOf(schemas, cfg.coreTools)
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
          // 【别再信减法，也别信 scoped schemas】注册数 − 摘掉的数只是估算：
          // deny 按本会话注册表算，restrict() 却作用在更大的共享表上（实测 38 vs 72）。
          // 而 restrict 之后重新读 scopedTools.schemas() 仍然是 138 —— 那个接口不反映限制。
          // 所以"到底发出去多少个"只有 cache_probe_report 的 tools/toolsChars 是权威的。
          estimatedAdvertised: Math.max(0, catalog.total - denyCount),
          // [已删除] advertisedAfterRestrict：三轮 A/B 实测证明它报 138 而实际是 72，会误导人。
          tagCounts: catalog.tags,
          // 还没被任何阶段管的工具组（新装的插件会出现在这里；它们目前永远放行）
          unclaimedTags: findUnclaimed({ tagCounts: catalog.tags, claimed, tagBytes }),
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
        // 语义打分路由：开关 / 阈值 / 最近一次判定（猜不准时是 null）
        intentRouting: cfg.intentRouting,
        intentMinScore: cfg.intentMinScore,
        intentMinMargin: cfg.intentMinMargin,
        // @experimental 多领域并集：默认 false；开了才会出现 "a+b" 这种阶段名
        unionEnabled: cfg.unionEnabled,
        lastIntent,
        // 自适应阶段：默认关闭；开了之后最近一次判定也在这里
        adaptiveStage: cfg.adaptiveStage,
        adaptiveWindow: cfg.adaptiveWindow,
        lastAdaptive,
        // 活动日志：只回最近 5 条，完整记录用 route_activity 查
        activity: activity.summary(),
        recentActivity: activity.recent(5),
        // 智能开关 + 主动建议 + 闭环统计
        autoRestrictPolicy: cfg.autoRestrictPolicy,
        pendingSuggestion: feedback.getSuggestion(key),
        denyRecovery: feedback.summary(key),
        // 空转工具画像：哪些工具从装上到现在一次都没被调用过（→ 那些插件可以卸）
        toolUsage: cfg.usageTracking
          ? usage.summarize(registeredNames, (n) => tagOf(n, cfg.coreTools))
          : null,
          lastArbiterDecision,
          // 任务驱动的临时收窄（route_use）
          dynamicGroups: dynamicGrants.get(key) ? [...dynamicGrants.get(key).groups] : [],
          dynamicTurnsLeft: dynamicGrants.get(key) ? dynamicGrants.get(key).remainingTurns : 0,
          // 成本闸门：每个阶段"现在切过去"值不值（按最坏情况估）
          switchEconomics: {
            enabled: cfg.costGateEnabled,
            contextTokens: promptTokensBySession.get(key) || 0,
            maxPaybackTurns: cfg.switchPaybackTurns,
            costRatio: cfg.switchCostRatio,
            tokensPerByte: cfg.switchSavingsPerByte,
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
          hintEffective: guard.safe && hintAvailable && hintRuntime && !hintOffSessions.has(key),
          hintAvailable,
          hintEnabled: hintRuntime && !hintOffSessions.has(key),
          restrictEffective: cfg.enforceByRestrict && guard.safe,
          // 当前用的裁剪模式：deny（摘不要的）还是 allow（只留要的）
          restrictMode: cfg.restrictMode === 'allow' ? 'allow' : 'deny',
          restrictedFor: (restrictions.get(key) || {}).stage || '',
          restrictedToolCount: (restrictions.get(key) || {}).denyCount || 0,
        }
      },
    }),
  )

  // ------------------------------------------------------------------
  // 4~4.6 复位 / 按需收窄 / 提示开关 —— 定义搬到 lib/tools-dynamic.js，
  //       这里只注入依赖（状态操作仍留在本文件，避免把闭包搬来搬去）
  // ------------------------------------------------------------------
  registerDynamicTools(ctx, {
    RENDER,
    keyOf,
    // 活动日志：给 route_activity 用；只读，不暴露内部数组
    readActivity(args) {
      const limit = args && Number.isFinite(Number(args.limit)) ? Number(args.limit) : 20
      const kind = args && typeof args.kind === 'string' ? args.kind : ''
      return {
        summary: activity.summary(),
        kinds: activity.kinds,
        events: activity.recent(limit, kind),
      }
    },

    resetSession(key, agent) {
      activity.log('reset', { stage: state.get(key).stage })
      const before = state.get(key)
      state.reset(key)
      switchArbiter.reset(key)
      disclosedTags.delete(key)
      dynamicGrants.delete(key)
      lastArbiterDecision = null
      lastLintHit = ''
      const restriction = refreshRestriction(key, agent)
      return {
        reset: true,
        previousStage: before.stage,
        stage: state.get(key).stage,
        restriction,
        message: '已复位到默认阶段，可以继续。',
      }
    },

    clearGrant(key, agent) {
      dynamicGrants.delete(key)
      const restriction = refreshRestriction(key, agent)
      return { ok: true, released: true, restriction, message: '已放开全部工具组。' }
    },

    setGrant(key, groups, turns, agent) {
      dynamicGrants.set(key, { groups: new Set(groups), remainingTurns: turns, createdAt: Date.now() })
      activity.log('grant', { groups: groups.join(','), turns })
      const restriction = refreshRestriction(key, agent)
      return {
        ok: true,
        groups,
        turns,
        restriction,
        message: `已收窄到 ${groups.join('/')}，${turns} 轮后自动恢复。用完可 route_use({"groups":[]}) 立刻放开。`,
      }
    },

    setHint(key, enabled) {
      if (enabled) hintOffSessions.delete(key)
      else hintOffSessions.add(key)
    },

    hintState(key) {
      return {
        hintEnabled: hintRuntime && !hintOffSessions.has(key),
        hintAvailable,
        degraded: !guard.safe,
        sample: hintFor(key),
        scope: '本会话（不影响其它会话）',
        note: '改动从下一次请求开始生效（本轮的提示已经发出去了）。',
      }
    },
  })

  // ------------------------------------------------------------------
  // 4.5 工具 4：route_init —— 生成"你自己领域的"阶段模板
  //   永远放行（在 ALWAYS_ALLOW 里），因为它也是逃生/诊断工具
  // ------------------------------------------------------------------
  ctx.effect(() =>
    ctx.tools.register({
      name: 'route_init',
      description:
        'Generate stage configuration. Without arguments: scan the tools actually installed here and write a custom_stages.sample.json template (not auto-loaded). With preset: write a ready-to-use custom_stages.json from a bundled example (reload the plugin afterwards).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          preset: {
            type: 'string',
            description:
              'A bundled example: python-data / web-dev / writing / qq-chat. Writes a ready-to-use custom_stages.json directly.',
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
            const loaded = readPreset(preset)
            if (!loaded.ok) throw new Error(loaded.error || `读不到 ${preset}`)
            const parsed = loaded.data
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
      const denyKey = keyOf(exec)

      // ---- 5.0 使用画像：记一次真实调用（空转工具画像的唯一数据源）----
      if (cfg.usageTracking && toolName) usage.record(toolName)
      // 自适应信号：只记"非基础工具"的组名，基础工具哪个阶段都该在
      if (cfg.adaptiveStage && toolName) {
        try {
          signals.push(keyOf(exec), tagOf(toolName, cfg.coreTools))
        } catch {
          // 静默
        }
      }

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
              activity.log('deny', { by: 'lint', tool: toolName })
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
            activity.log('deny', { by: 'stage', stage: snapshot.stage, tool: toolName })
            feedback.noteDeny(key)
            return { kind: 'deny', reason: verdict.reason, info: { name: 'minimal-router', code: 'STAGE_DENIED' } }
          }
        }
      }
      // 【C · 闭环】上一次被拦之后，模型换了别的工具继续干 → 记一次"自己恢复了"
      if (toolName && !ALWAYS_ALLOW.includes(toolName)) feedback.noteRecover(denyKey)
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
      // ---- 闸门 0：任务驱动的收窄到期自动恢复 ----
      const activeGrant = dynamicGrants.get(key)
      if (activeGrant) {
        activeGrant.remainingTurns -= 1
        if (activeGrant.remainingTurns <= 0) {
          dynamicGrants.delete(key)
          refreshRestriction(key, payload && payload.agent)
        }
      }

      // ---- 阶段判定：关键词优先，没命中再用语义打分补一刀 ----
      // 语义结果同样要过下面三道闸门（上下文 / 成本 / 迟滞），所以猜错也不会立刻切
      const keywordStage = detectStage(text, cfg.stages, cfg.stageOrder)
      let detected = keywordStage
      lastIntent = null
      if (!detected && intentDetector) {
        const guess = intentDetector(text)
        if (guess) {
          detected = guess.stage
          lastIntent = { at: Date.now(), by: 'intent', ...guess, from: state.get(key).stage }
        } else if (typeof intentDetector.probe === 'function') {
          // 【B】正式判定没过，但"有点像" → 记一条建议，让提示里多一句，不切阶段
          const soft = intentDetector.probe(text)
          if (soft) {
            const def = cfg.stages[soft.stage]
            const tag = def && Array.isArray(def.allow) && def.allow[0] ? String(def.allow[0]) : ''
            if (tag) feedback.setSuggestion(key, { stage: soft.stage, tag, score: soft.score })
          }
        }
      }
      // ---- 自适应：关键词和语义都没说话时，看"最近真的用了什么" ----
      // 只在 auto 阶段才敢动（已经在某个阶段里，说明有人在管，别抢方向盘）
      lastAdaptive = null
      if (!detected && cfg.adaptiveStage && state.get(key).stage === 'auto') {
        const sig = signals.dominant(key, {
          minCalls: cfg.adaptiveMinCalls,
          minShare: cfg.adaptiveMinShare,
        })
        if (sig) {
          const target = suggestStageForTag(sig.tag, cfg.stages)
          if (target) {
            detected = target
            lastAdaptive = { at: Date.now(), by: 'adaptive', stage: target, ...sig }
          }
        }
      }
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
        activity.log('block', { by: 'context', from: current, to: detected })
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
          activity.log('block', { by: 'cost', from: current, to: detected, payback: economy.paybackTurns })
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
        // 关键词命中走状态机（它自己会再判一次）；语义命中直接应用，避免被"粘住"分支吃掉
        if (keywordStage) state.onUserMessage(key, text)
        else state.applyStage(key, detected, 'intent')
        activity.log('switch', {
          from: current,
          to: detected,
          by: keywordStage ? 'keyword' : lastAdaptive ? 'adaptive' : 'intent',
        })
        feedback.clearSuggestion(key)
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
                `  建议现在开一个新会话继续，把这块上下文留在原地；\n` +
                `  或者先跑 /trim（若装了 dsh-command-context-trim）把最旧的历史削掉，再切阶段。`,
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
