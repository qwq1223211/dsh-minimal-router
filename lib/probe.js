/**
 * ============================================================================
 * dsh-cache-probe —— 缓存探针（S0）
 * ============================================================================
 *
 * 【这个插件干什么】
 *   它挂在每一次模型请求上，只做观察，不改任何东西：
 *     1. 请求前：算出「前缀指纹」（system + 工具全量 JSON 的哈希）
 *     2. 请求后：从 usage 块里读 inputTokens / cacheReadTokens / cacheWriteTokens
 *     3. 合成一条记录 → 控制台打一行 + 落盘 JSONL
 *
 * 【为什么它不破坏缓存】
 *   · 它不注册任何 systemPrompt.section()，不改系统提示
 *   · 它不注册/注销工具（除了自己的两个 report/clear 工具，装完就固定）
 *   · 它只是「包住」下游的流，chunk 原样透传
 *
 * 【为什么它不可能搞崩 DSH】
 *   · 全程 try/catch，任何异常都吞掉并原样委托下游
 *   · 落盘是异步的，不阻塞模型输出
 *   · 没有循环遍历不可控数据、没有定时器
 * ============================================================================
 */

import { fileURLToPath } from 'node:url'
import {
  describeRequest,
  makeRecord,
  summarize,
  wrapStream,
  splitWaterfallArgs,
  emptyIterable,
} from './probe-core.js'
import { createStore } from './probe-store.js'

// 【修改这里】插件在插件管理器里显示的名字
export const name = 'cache-probe'

// 只用 tools 服务（注册 report/clear）；llm/stream 是事件，不需要 inject
export const inject = ['tools']

// 【修改这里】默认落盘位置：本插件目录下的 data/usage.jsonl
const DEFAULT_DATA_FILE = fileURLToPath(new URL('../data/usage.jsonl', import.meta.url))

const RENDER = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

/** 配置规范化：脏数据一律回退默认值，绝不让插件加载失败。 */
export function normalizeConfig(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const limit = Number(src.reportLimit)
  const file = typeof src.dataFile === 'string' && src.dataFile.trim() ? src.dataFile.trim() : DEFAULT_DATA_FILE
  return {
    dataFile: file,
    logToConsole: src.logToConsole !== false,
    reportLimit: Number.isFinite(limit) && limit >= 1 && limit <= 500 ? Math.trunc(limit) : 20,
  }
}

export function applyProbe(ctx, config = {}) {
  const cfg = normalizeConfig(config)
  const store = createStore({ file: cfg.dataFile })
  let lastFailure = ''
  // 【按会话聚合】最近一次请求的会话指纹（哈希后的）。用来回答"这个会话花了多少"。
  let lastSession = ''

  /**
   * 取当前阶段名。
   * S0 阶段还没有路由器，固定返回 'n/a'；
   * 【S1 接上 dsh-minimal-router 后】这里会自动读到真实阶段，不用改探针。
   */
  function currentStage() {
    try {
      const router = typeof ctx.get === 'function' ? ctx.get('minimalRouter') : undefined
      if (router && typeof router.currentStage === 'function') {
        const stage = router.currentStage()
        if (typeof stage === 'string' && stage) return stage
      }
    } catch {
      // 读不到就当没有，不影响测量
    }
    return 'n/a'
  }

  // ------------------------------------------------------------------
  // 核心：监听每一次模型请求
  // ------------------------------------------------------------------
  ctx.on('llm/stream', (...args) => {
    const { options, next } = splitWaterfallArgs(args)

    let desc
    try {
      desc = describeRequest(options)
      if (desc.session) lastSession = desc.session
    } catch (error) {
      lastFailure = `describe: ${error && error.message ? error.message : String(error)}`
      return next ? next() : emptyIterable()
    }

    let inner
    try {
      inner = next ? next() : emptyIterable()
    } catch (error) {
      // 下游自己炸了，不归我们管，让异常照常往上抛
      throw error
    }

    return wrapStream(inner, (usage) => {
      try {
        const record = makeRecord(desc, usage, Date.now(), { stage: currentStage() })
        if (cfg.logToConsole) {
          const pct = (record.hitRate * 100).toFixed(1)
          // 用 console.info 而不是 log：库代码不该往 stdout 正式输出里插行
          console.info(
            `[cache-probe] prompt=${record.promptTokens} new=${record.inputTokens} cached=${record.cacheReadTokens} ` +
              `hit=${pct}% tools=${record.tools}(${record.toolsChars}B) sig=${record.prefixSig} stage=${record.stage}`,
          )
        }
        // 【重要】不 await：落盘不能拖慢模型输出
        void store.append(record).then((ok) => {
          if (!ok) lastFailure = 'append failed'
        })
      } catch (error) {
        lastFailure = `record: ${error && error.message ? error.message : String(error)}`
      }
    })
  })

  // ------------------------------------------------------------------
  // 工具 1：cache_probe_report —— 看基线和历史
  // ------------------------------------------------------------------
  ctx.effect(() =>
    ctx.tools.register({
      name: 'cache_probe_report',
      description:
        '读取缓存探针的历史记录：最近若干次请求的 inputTokens / cacheReadTokens / 命中率 / 前缀指纹，以及汇总（平均命中率、前缀变化次数）。用 scope:"session" 只看当前会话。用来验证前缀缓存有没有被破坏。只读。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 200, description: '返回最近多少条原始记录，默认用配置里的 reportLimit。' },
          scope: {
            type: 'string',
            enum: ['all', 'session'],
            description: 'all = 全部历史（默认）；session = 只看当前这个会话。',
          },
        },
      },
      output: RENDER,
      async execute(args) {
        const asked = args && typeof args === 'object' ? Number(args.limit) : NaN
        const limit = Number.isFinite(asked) && asked >= 1 ? Math.min(Math.trunc(asked), 200) : cfg.reportLimit
        const scope = args && args.scope === 'session' ? 'session' : 'all'
        const recent = await store.read(limit)
        const total = await store.count()

        // 【按会话聚合】会话过滤要读更多历史（默认 20 条可能不够覆盖整个会话）
        if (scope === 'session') {
          const wider = await store.read(200)
          const mine = wider.filter((r) => r && lastSession && r.session === lastSession)

          // 【A/B 实测发现】父子会话共享同一个 sessionId，所以"只看会话"会把
          // 主会话和子会话的请求混在一起 —— 两臂报出来的数会一模一样。
          // 解法：按前缀指纹分组，让你看到"这个会话里出现过哪几种工具表"。
          const groups = new Map()
          for (const record of mine) {
            const sig = record.prefixSig || 'n/a'
            const entry =
              groups.get(sig) ||
              {
                prefixSig: sig,
                tools: record.tools || 0,
                toolsChars: record.toolsChars || 0,
                count: 0,
                promptTokens: 0,
                cacheReadTokens: 0,
              }
            entry.count += 1
            entry.promptTokens += record.promptTokens || 0
            entry.cacheReadTokens += record.cacheReadTokens || 0
            entry.tools = record.tools || 0
            entry.toolsChars = record.toolsChars || 0
            groups.set(sig, entry)
          }
          const byPrefix = [...groups.values()]
            .map((entry) => ({
              ...entry,
              hitRate: entry.promptTokens > 0 ? Math.round((entry.cacheReadTokens / entry.promptTokens) * 10000) / 10000 : 0,
            }))
            .sort((a, b) => b.count - a.count)

          return {
            file: store.file,
            scope: 'session',
            session: lastSession || '(还没记录到会话指纹)',
            total,
            sessionTotal: mine.length,
            summary: summarize(mine, { session: lastSession }),
            // 这个会话里出现过的不同工具表（按出现次数排序）——A/B 就看这里
            byPrefix,
            recent: mine.slice(-Math.min(limit, mine.length)),
            hint:
              lastSession
                ? `只统计当前会话：${mine.length} 次请求（历史最多回看 200 条，超长会话可能截断）。` +
                  '注意：父子会话共享同一个 sessionId，这里可能混着子智能体的请求——' +
                  '要看工具表有没有真的变，请对比 byPrefix 里不同 prefixSig 的 toolsChars。' +
                  'promptTokens = 新增未命中 + 命中缓存；prefixChanges 每 +1 就是一次全价重算。'
                : '还没有记录到会话指纹（可能是刚开始用，或者这次请求还没跑完）。先聊一轮再看。',
          }
        }

        return {
          file: store.file,
          scope: 'all',
          total,
          lastFailure: lastFailure || '',
          summary: summarize(recent),
          recent,
          hint:
            '读数说明：promptTokens = inputTokens + cacheReadTokens（DeepSeek 把「新增未命中」和「命中缓存」分开报），' +
            'hitRate = cacheReadTokens / promptTokens。prefixSig 相同却 hitRate 很低，说明适配器不上报缓存或缓存已过期；' +
            'prefixChanges 每 +1，就代表你付了一次全量前缀重建。toolsChars 是工具声明的字节数，它是前缀里最肥的一块。',
        }
      },
    }),
  )

  // ------------------------------------------------------------------
  // 工具 2：cache_probe_clear —— 清空，做对照实验用
  // ------------------------------------------------------------------
  ctx.effect(() =>
    ctx.tools.register({
      name: 'cache_probe_clear',
      description: '清空缓存探针的全部历史记录，用来做「改动前 / 改动后」的对照实验。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: RENDER,
      async execute() {
        const ok = await store.clear()
        return { cleared: ok, file: store.file }
      },
    }),
  )
}
