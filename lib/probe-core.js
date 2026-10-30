/**
 * ============================================================================
 * dsh-cache-probe · lib/probe.js
 * ============================================================================
 * 纯函数区：不碰 ctx、不碰文件、不碰网络。
 * 所以这里每一个函数都能被 test/probe.test.mjs 单独测。
 *
 * 核心概念「前缀指纹 prefixSig」：
 *   DeepSeek 的上下文缓存是「按前缀精确匹配」。一次请求里，缓存前缀 = 系统提示 +
 *   工具声明（+ 历史消息）。所以我们把 system 和 tools 全量序列化后算一个哈希——
 *     · 两次请求 prefixSig 相同 → 前缀一模一样 → 缓存应该命中
 *     · 两次请求 prefixSig 不同 → 前缀变了 → 缓存 100% 失效，别指望省钱
 *   token 数是「事后结果」，prefixSig 是「事前原因」。看原因比看结果快一步。
 * ============================================================================
 */

// 【修改这里】探针自己的版本号，改了记录格式就+1，方便区分新旧数据
export const RECORD_VERSION = 1

/**
 * FNV-1a 32 位哈希：够快（200KB 约 1ms）、够稳（不需要加密强度）。
 * 这里只用来判断「两个前缀是不是同一串字节」，不做安全用途。
 * @param {string} text
 * @returns {string} 8 位十六进制
 */
export function fnv1a(text) {
  const s = typeof text === 'string' ? text : ''
  let hash = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i)
    // 乘以 FNV 质数 16777619，用移位避免浮点误差
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** JSON.stringify 的安全版：循环引用 / BigInt / 抛错都返回 ''，绝不炸。 */
export function safeStringify(value) {
  try {
    const text = JSON.stringify(value)
    return typeof text === 'string' ? text : ''
  } catch {
    return ''
  }
}

/** 取一个可能不存在的字符串字段，永远返回 string（保证无损 JSON）。 */
function str(value) {
  return typeof value === 'string' ? value : ''
}

/** 取一个可能不存在的数字字段，永远返回有限数字（NaN/Infinity 一律变 0）。 */
function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * 从消息数组里抽出所有 system 角色的文本。
 *
 * 【实测发现，非常重要】DSH 并不把系统提示放在 GenerateOptions.system 里，
 * 而是作为 role='system' 的消息塞进 messages（source.kind === 'system-prompt'）。
 * 所以「前缀」的真实布局是：
 *     messages[0] (system 提示) + tools 声明 + 后续历史
 * 指纹必须把这块算进去，否则漏掉前缀里最大的一块。
 * @param {unknown[]} messages
 */
function systemTextOf(messages) {
  const list = Array.isArray(messages) ? messages : []
  let text = ''
  let count = 0
  for (const message of list) {
    if (!message || typeof message !== 'object' || message.role !== 'system') continue
    count += 1
    const content = message.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && block.type === 'text' && typeof block.text === 'string') text += `${block.text}\n`
      }
    } else if (typeof message.text === 'string') {
      text += `${message.text}\n`
    }
  }
  return { text, count }
}

/**
 * 拆解一次请求的「静态形状」——这就是缓存前缀的全部构成。
 * @param {object} options GenerateOptions
 * @returns {{provider:string, model:string, purpose:string, messages:number,
 *            tools:number, systemChars:number, systemMessages:number,
 *            toolsChars:number, prefixSig:string}}
 */
export function describeRequest(options) {
  const opts = options && typeof options === 'object' ? options : {}
  const tools = Array.isArray(opts.tools) ? opts.tools : []
  const messages = Array.isArray(opts.messages) ? opts.messages : []
  const systemField = str(opts.system)
  const fromMessages = systemTextOf(messages)
  const toolsJson = safeStringify(tools)
  const systemChars = systemField.length + fromMessages.text.length

  // 前缀 = 系统提示（字段 + system 消息）+ 工具声明。
  // 顺序必须固定，否则同一份内容会算出不同指纹。
  const signatureSource = `s:${systemField}\nsm:${fromMessages.text}\nt:${toolsJson}`

  return {
    provider: str(opts.provider),
    model: str(opts.model),
    purpose: str(opts.purpose),
    messages: messages.length,
    tools: tools.length,
    systemChars,
    systemMessages: fromMessages.count,
    toolsChars: toolsJson.length,
    prefixSig: fnv1a(signatureSource),
  }
}

/**
 * 把「请求形状 + 用量」合成一条记录。
 * 【重要】所有字段都保证有值、没有 undefined —— DSH 的工具返回值要求无损 JSON，
 * 这里先守住，后面 report 直接透传就不会报 invalid output。
 * @param {object} desc describeRequest() 的结果
 * @param {object} usage TokenUsage（可能缺字段）
 * @param {number} at 毫秒时间戳
 * @param {{stage?:string}} [extra]
 */
export function makeRecord(desc, usage, at, extra = {}) {
  const d = desc && typeof desc === 'object' ? desc : {}
  const u = usage && typeof usage === 'object' ? usage : {}
  // 【实测语义】DeepSeek 报的 inputTokens 是「本次新增、未命中缓存」的 token，
  // cacheReadTokens 是「命中缓存」的 token。两者相加才是这次请求的真实长度。
  const inputTokens = num(u.inputTokens)
  const cacheReadTokens = num(u.cacheReadTokens)
  const cacheWriteTokens = num(u.cacheWriteTokens)
  const outputTokens = num(u.outputTokens)
  const promptTokens = inputTokens + cacheReadTokens
  const hitRate = promptTokens > 0 ? round4(cacheReadTokens / promptTokens) : 0
  const time = num(at) || Date.now()

  return {
    v: RECORD_VERSION,
    at: time,
    iso: new Date(time).toISOString(),
    provider: str(d.provider),
    model: str(d.model),
    purpose: str(d.purpose),
    // 【S1 接上路由器之后】这里会变成真实阶段名，S0 阶段固定是 'n/a'
    stage: str(extra.stage) || 'n/a',
    messages: num(d.messages),
    tools: num(d.tools),
    systemChars: num(d.systemChars),
    systemMessages: num(d.systemMessages),
    toolsChars: num(d.toolsChars),
    prefixSig: str(d.prefixSig) || 'n/a',
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    promptTokens,
    outputTokens,
    hitRate,
  }
}

/** 保留 4 位小数，避免浮点尾巴把 JSON 撑得难看。 */
export function round4(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 10000) / 10000
}

/**
 * 汇总一批记录，回答三个问题：
 *   1. 缓存命中率怎么样？
 *   2. 前缀被改过几次？（= 你为改动付了多少次全量重建）
 *   3. 最近一次是什么状态？
 * @param {object[]} records
 */
export function summarize(records) {
  const list = Array.isArray(records) ? records.filter((r) => r && typeof r === 'object') : []
  if (list.length === 0) {
    return {
      count: 0,
      avgHitRate: 0,
      minHitRate: 0,
      maxHitRate: 0,
      distinctPrefixes: 0,
      prefixChanges: 0,
      toolsCount: 0,
      toolsChars: 0,
      lastPromptTokens: 0,
      lastInputTokens: 0,
      lastCacheReadTokens: 0,
      lastHitRate: 0,
      lastPrefixSig: 'n/a',
    }
  }

  let sum = 0
  let min = 1
  let max = 0
  const sigs = new Set()
  let prevSig = ''
  let changes = 0

  for (const r of list) {
    const rate = num(r.hitRate)
    sum += rate
    if (rate < min) min = rate
    if (rate > max) max = rate
    const sig = str(r.prefixSig)
    sigs.add(sig)
    if (prevSig !== '' && sig !== prevSig) changes += 1
    prevSig = sig
  }

  const last = list[list.length - 1]
  return {
    count: list.length,
    avgHitRate: round4(sum / list.length),
    minHitRate: round4(min),
    maxHitRate: round4(max),
    distinctPrefixes: sigs.size,
    prefixChanges: changes,
    toolsCount: num(last.tools),
    toolsChars: num(last.toolsChars),
    lastPromptTokens: num(last.promptTokens),
    lastInputTokens: num(last.inputTokens),
    lastCacheReadTokens: num(last.cacheReadTokens),
    lastHitRate: num(last.hitRate),
    lastPrefixSig: str(last.prefixSig),
  }
}

/** 空异步迭代器：仅在拿不到下游 next 时用作兜底，保证不抛错。 */
export async function* emptyIterable() {}

/**
 * ★ 核心：包住下游的流。
 * 只观察 usage 块，其余 chunk 原封不动按序透传 —— 探针绝不能改变模型输出。
 * @param {AsyncIterable|Promise<AsyncIterable>} inner 下游流
 * @param {(usage:object)=>void} onUsage 看到 usage 时的回调
 */
export function wrapStream(inner, onUsage) {
  return (async function* wrapped() {
    let source = inner
    // 少数框架会把迭代器包成 Promise，这里兼容一下
    if (source && typeof source[Symbol.asyncIterator] !== 'function') {
      source = await source
    }
    if (!source || typeof source[Symbol.asyncIterator] !== 'function') return

    for await (const chunk of source) {
      try {
        if (chunk && chunk.type === 'usage' && chunk.usage && typeof onUsage === 'function') {
          onUsage(chunk.usage)
        }
      } catch {
        // 记录失败绝不打断模型输出
      }
      yield chunk
    }
  })()
}

/**
 * 从瀑布参数里安全地抠出 (options, next)。
 * 不假设参数位置，只假设「最后一个函数参数就是 next」。
 * @param {unknown[]} args
 */
export function splitWaterfallArgs(args) {
  const list = Array.isArray(args) ? [...args] : []
  let next
  const last = list[list.length - 1]
  if (typeof last === 'function') {
    next = list.pop()
  }
  return { options: list[0], next }
}
