/**
 * ============================================================================
 * test/union-e2e.test.mjs · 端到端：一句话 → 并集 → route_status 能看到
 * ============================================================================
 * 这个文件只验证一件事（也就是验收标准本身）：
 *
 *   输入 "帮我写个 Python 脚本爬取网页，然后整理成一份周报文档"
 *   → router 真的把阶段切成 "document-write+python-code"
 *   → 两边的工具组都被放开（docx/python/terminal/study 都还在）
 *   → route_status 里能读到并集
 *
 * 做法：起一个假 ctx（形态照抄 DSH），调**真实的 apply()**，
 * 再走真实的 "agent/inbox/claimed" 钩子，最后调真实的 route_status 工具。
 * ============================================================================
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../index.js'
import { detectStage } from '../lib/stage.js'
import { DEFAULT_STAGES, STAGE_ORDER } from '../lib/stages-default.js'

const SENTENCE = '帮我写个 Python 脚本爬取网页，然后整理成一份周报文档'
const UNION = 'document-write+python-code'

/** 假 ctx：够 apply() 跑起来，并且 restrict 真的会把工具从 schemas 里摘掉 */
function makeRuntime(toolNames) {
  const listeners = new Map()
  const tools = new Map()
  const restricts = []
  const PAD = 'x'.repeat(600)
  let denied = new Set()

  const base = toolNames.map((name) => ({
    name,
    description: `${name} ${PAD}`,
    parameters: { type: 'object', properties: { a: { type: 'string' } } },
  }))

  const scoped = {
    schemas: () => base.filter((tool) => !denied.has(tool.name)),
    restrict(filter) {
      restricts.push(filter)
      denied = new Set(Array.isArray(filter && filter.deny) ? filter.deny : [])
      return () => {
        denied = new Set()
      }
    },
  }

  const ctx = {
    effect(fn) {
      fn()
      return () => {}
    },
    on(event, listener) {
      const list = listeners.get(event) || []
      list.push(listener)
      listeners.set(event, list)
      return () => {}
    },
    tools: {
      register(definition) {
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
      schemas: () => base.filter((tool) => !denied.has(tool.name)),
      restrict() {
        throw new Error('tools.restrict() requires a scoped context (agent.ctx)')
      },
    },
    systemPrompt: { context: () => () => {} },
    // 【必须给】拿不到模型名时路由会 fail-safe 判成"不安全"，于是关掉收窄 ——
    // 第一版这里返回 undefined，结果 restrictedFor 永远是空（被路由器正确保护了）。
    get(name) {
      if (name === 'agentDefaultModel') {
        return { currentSelection: () => ({ provider: 'deepseek-account', model: 'deepseek-flash' }) }
      }
      return undefined
    },
  }

  const agent = { id: 'union-e2e', ctx: { tools: scoped } }
  return { ctx, listeners, tools, restricts, agent, scoped }
}

const TOOLS = [
  'read',
  'write',
  'pwsh',
  'route_stage',
  'route_status',
  'route_reset',
  // python 侧
  'terminal_spawn',
  'search_web',
  // 文档侧
  'office_docx_create',
  'office_pptx_create',
  'study_card_add',
  // 无关领域（应该被摘掉）
  'unity_object_create',
  'meshy_image_to_3d',
  'ego_navigate',
]

/** 喂一条用户消息，走真实的路由钩子 */
function feedUserMessage(runtime) {
  const list = runtime.listeners.get('agent/inbox/claimed') || []
  assert.ok(list.length > 0, 'router 应该注册了 agent/inbox/claimed')
  const payload = { agent: runtime.agent, message: { content: [{ type: 'text', text: SENTENCE }] } }
  for (const listener of list) listener(payload)
}

/**
 * 让路由记住这个 agent。
 * 【为什么必须单独喂】router 把 agent 存在 agentRefs 里（供 restrict 用），
 * 而 agentRefs 是在 `agent/created` 钩子里写入的 —— 只发消息、不宣告 agent，
 * refreshRestriction 会返回 no-agent-context，收窄根本不发生（第一版就是这么挂的）。
 */
function feedAgentCreated(runtime) {
  for (const listener of runtime.listeners.get('agent/created') || []) {
    listener({ agent: runtime.agent })
  }
}

test('关键词路径：跨领域句直接返回并集（不是命中就 return）', () => {
  assert.equal(detectStage(SENTENCE, DEFAULT_STAGES, STAGE_ORDER), UNION)
})

test('端到端：一句话走完 inbox → 并集 → route_status 能看到', async () => {
  const rt = makeRuntime(TOOLS)
  apply(rt.ctx, {
    enforceStage: true,
    enforceByRestrict: true,
    // 只关掉与本次无关的探针；guard 保持默认（关掉它会让 restrict 被判定为不生效）
    probeEnabled: false,
    costGateEnabled: false,
    // 【必须关】autoRestrictPolicy 默认开启：非显式切换前它会先算"几轮回本"，
    // 而测试里上下文是 0（还没发过请求）→ 算不出收益 → 决定不瘦身。
    // 这里测的是"并集能不能走通"，不是经济政策，所以关掉它。
    autoRestrictPolicy: false,
    switchConfirmations: 1,
    switchCooldownMs: 0,
    intentRouting: true,
  })

  feedAgentCreated(rt)
  feedUserMessage(rt)

  const status = await rt.tools.get('route_status').execute({}, { agent: rt.agent })

  // ① 阶段就是并集
  assert.equal(status.stage, UNION, `route_status.stage 应该是并集，实际 ${status.stage}`)
  // ② 收窄确实按并集生效
  assert.equal(status.restrictedFor, UNION, 'restrictedFor 要标出并集')
  assert.ok(status.restrictedToolCount > 0, '应该真的摘掉了工具')
  // ③ 两边领域的工具都还在
  const visible = rt.scoped.schemas().map((tool) => tool.name)
  for (const name of ['terminal_spawn', 'office_docx_create', 'study_card_add']) {
    assert.ok(visible.includes(name), `${name} 属于并集，必须保留`)
  }
  // ④ 无关领域被摘掉（unity / meshy 都被阶段表认领，所以能摘）
  for (const name of ['unity_object_create', 'meshy_image_to_3d']) {
    assert.equal(visible.includes(name), false, `${name} 不在并集里，应该被摘掉`)
  }
  // ⑤ 「没被任何阶段认领」的标签永不误杀（ego 就是这种）——这是设计，不是漏网
  assert.ok(visible.includes('ego_navigate'), '未认领标签必须保留：宁可少省，也不误杀新插件')
  // ⑤ 摘掉的正是 deny 列表（不是 allow 模式）
  const last = rt.restricts[rt.restricts.length - 1]
  assert.ok(Array.isArray(last.deny), '默认必须是 deny 模式')
  assert.equal(last.allow, undefined)
})
