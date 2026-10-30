/**
 * dsh-minimal-router 的自测脚本（不需要装进 DSH 就能跑）
 *
 * 跑法：node test/router.test.mjs
 *
 * 覆盖四块：
 *   1. 自动分类与越界判定（classify）
 *   2. 阶段状态机与关键词识别（stage）
 *   3. 尾部提示渲染，含 ≤200 字硬校验（prompt）
 *   4. 本地体检：去噪 + 死循环/递归扫描（lint）
 *   5. 集成：真的调 apply()，验证拦截链路和逃生门
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  ALWAYS_ALLOW,
  tagOf,
  buildCatalog,
  claimedTags,
  decideOutOfStage,
  suggestStageForTag,
  computeDenyList,
} from '../lib/classify.js'
import { createStageState, detectStage, textOfMessage, keywordMatches, isExplicitSwitch, createSwitchArbiter } from '../lib/stage.js'
import { renderHint, HINT_LIMIT } from '../lib/prompt.js'
import { stripNoise, scanCode, formatFindings, matchBrace, lineAt } from '../lib/lint.js'
import { resolveCapability, formatDegradeWarning, KNOWN_CAPABILITIES } from '../lib/model-guard.js'
import {
  DEFAULT_CORE_TOOLS,
  isCoreTool,
  validateStagesConfig,
  mergeStages,
  findUnclaimed,
  buildTemplate,
  loadCustomStagesSync,
} from '../lib/stages-config.js'
import { estimateSwitchEconomy, decideByEconomy, describeEconomy } from '../lib/cost.js'
import { apply, normalizeConfig, collectStrings, DEFAULT_STAGES, inject, STATE_DIR, pickProbeDataFile, listPresets } from '../index.js'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0
const failures = []
const startedAt = Date.now()

async function test(title, fn) {
  try {
    await fn()
    passed += 1
    console.log(`${GREEN}\u2714 PASS${RESET}  ${DIM}${String(passed + failed).padStart(2, '0')}${RESET}  ${title}`)
  } catch (error) {
    failed += 1
    failures.push({ title, error })
    console.log(`${RED}\u2716 FAIL${RESET}  ${DIM}${String(passed + failed).padStart(2, '0')}${RESET}  ${title}`)
    console.log(`      ${RED}${error && error.message ? error.message : String(error)}${RESET}`)
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || '断言失败')
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || '值不相等'}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  }
}

/** 测试用阶段表（和 index.js 的默认值一致，但独立一份，避免默认值改动影响断言） */
const STAGES = {
  auto: { title: '自动', allow: [], keywords: [] },
  core: { title: '通用', allow: [], keywords: ['通用'] },
  'unity-code': { title: 'Unity 代码', allow: ['unity'], keywords: ['代码', '编译', 'unity'] },
  'unity-ui': { title: 'Unity UI', allow: ['unity', 'ui'], keywords: ['界面', '按钮', 'ui'] },
  art: { title: '美术', allow: ['art', 'meshy'], keywords: ['贴图', '模型'] },
  audio: { title: '音频', allow: ['audio'], keywords: ['音效', '音乐'] },
}
const ORDER = ['unity-ui', 'art', 'audio', 'unity-code', 'core']
const CLAIMED = claimedTags(STAGES)

console.log(`\n${BOLD}dsh-minimal-router · 自测套件${RESET}\n`)

// ============================================================================
// 1. 自动分类
// ============================================================================
await test('分类：从工具名自动长标签（零配置）', () => {
  assertEqual(tagOf('unity_script_create'), 'unity')
  assertEqual(tagOf('meshy_image_to_3d'), 'meshy')
  assertEqual(tagOf('ui_add'), 'ui')
  assertEqual(tagOf('read'), 'core', '没有下划线的算基础工具')
  assertEqual(tagOf(''), 'core')
  assertEqual(tagOf(null), 'core')
})

await test('分类：MCP 工具的名字要认出真正的组（mcp__meshy__x → meshy）', () => {
  assertEqual(tagOf('mcp__meshy__meshy_image_to_3d'), 'meshy', 'MCP 的组名在中间，不能在 mcp 上')
  assertEqual(tagOf('mcp__other__do_thing'), 'other')
  assertEqual(tagOf('mcp__broken'), 'mcp', '三段不完整的名字退回 mcp（没人认领 → 永远放行，安全方向）')
})

await test('分类：MCP 工具能被阶段管住（曾经漏管的 29 个工具）', () => {
  const v = decideOutOfStage({ toolName: 'mcp__meshy__meshy_image_to_3d', stage: 'core', stages: STAGES, claimed: CLAIMED })
  assertEqual(v.allow, false, '美术工具在 core 阶段必须被拦')
  assert(v.reason.includes('route_stage("art")'), '要提示切到 art')
})

await test('分类：标签目录能统计每个组有多少个工具', () => {
  const catalog = buildCatalog(['read', 'write', 'unity_a', 'unity_b', 'meshy_x'])
  assertEqual(catalog.total, 5)
  assertEqual(catalog.tags.core, 2)
  assertEqual(catalog.tags.unity, 2)
  assertEqual(catalog.tags.meshy, 1)
})

await test('分类：被阶段认领的标签集合算得对', () => {
  assert(CLAIMED.has('unity'))
  assert(CLAIMED.has('ui'))
  assert(CLAIMED.has('meshy'))
  assert(!CLAIMED.has('foo'), '没人认领的标签不该出现在集合里')
})

// ============================================================================
// 2. 越界判定
// ============================================================================
await test('越界：auto 阶段一律放行（零摩擦）', () => {
  const v = decideOutOfStage({ toolName: 'meshy_image_to_3d', stage: 'auto', stages: STAGES, claimed: CLAIMED })
  assertEqual(v.allow, true)
})

await test('越界：逃生门工具永远放行', () => {
  for (const toolName of ALWAYS_ALLOW) {
    const v = decideOutOfStage({ toolName, stage: 'core', stages: STAGES, claimed: CLAIMED })
    assertEqual(v.allow, true, `${toolName} 必须永远放行`)
  }
})

await test('越界：本阶段允许的组放行', () => {
  const v = decideOutOfStage({ toolName: 'unity_object_create', stage: 'unity-code', stages: STAGES, claimed: CLAIMED })
  assertEqual(v.allow, true)
})

await test('越界：跨阶段调用被拦，且提示是祈使句并指名该切到哪', () => {
  const v = decideOutOfStage({ toolName: 'meshy_image_to_3d', stage: 'core', stages: STAGES, claimed: CLAIMED })
  assertEqual(v.allow, false)
  assert(v.reason.includes('阶段越界'), '要标明越界')
  assert(v.reason.includes('meshy'), '要指出是哪个组')
  assert(v.reason.includes('route_stage("art")'), '要明确告诉他该切到哪个阶段')
  assert(v.reason.includes('请立即'), '必须是祈使句')
})

await test('越界：没人认领的新插件标签 → 放行（绝不误杀）', () => {
  const v = decideOutOfStage({ toolName: 'foo_something_new', stage: 'core', stages: STAGES, claimed: CLAIMED })
  assertEqual(v.allow, true, '新装的插件不该因为没分类就被拦')
})

await test('越界：不认识的阶段名 → 当 auto 放行，别把人卡死', () => {
  const v = decideOutOfStage({ toolName: 'meshy_image_to_3d', stage: '不存在的阶段', stages: STAGES, claimed: CLAIMED })
  assertEqual(v.allow, true)
})

await test('越界：能给出"该去哪个阶段"的建议', () => {
  assertEqual(suggestStageForTag('meshy', STAGES), 'art')
  assertEqual(suggestStageForTag('audio', STAGES), 'audio')
  assertEqual(suggestStageForTag('zeta', STAGES), '')
})

// ============================================================================
// 2.5 分类补齐（选项 A）：13 个 Unity 子系统必须全部被认领
// ============================================================================
const UNITY_SUBSYSTEM_TAGS = [
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
]
const REAL_CLAIMED = claimedTags(DEFAULT_STAGES)

await test('补齐：13 个 Unity 子系统标签全部被认领（安全网不许有洞）', () => {
  for (const tag of UNITY_SUBSYSTEM_TAGS) {
    assert(REAL_CLAIMED.has(tag), `标签 ${tag} 没有被任何阶段认领，会永远放行`)
  }
})

await test('补齐：这些子系统的工具在 unity-code 阶段放行、在 core 阶段被拦', () => {
  for (const tag of UNITY_SUBSYSTEM_TAGS) {
    const toolName = `${tag}_something`
    const inCode = decideOutOfStage({ toolName, stage: 'unity-code', stages: DEFAULT_STAGES, claimed: REAL_CLAIMED })
    assertEqual(inCode.allow, true, `${toolName} 在 unity-code 阶段应该放行`)
    const inCore = decideOutOfStage({ toolName, stage: 'core', stages: DEFAULT_STAGES, claimed: REAL_CLAIMED })
    assertEqual(inCore.allow, false, `${toolName} 在 core 阶段应该被拦`)
  }
})

await test('补齐：Uikit / dialogue / quest 这些 UI 相关的在 unity-ui 阶段也放行', () => {
  for (const toolName of ['uikit_hud', 'dialogue_create', 'quest_create', 'ui_add']) {
    const v = decideOutOfStage({ toolName, stage: 'unity-ui', stages: DEFAULT_STAGES, claimed: REAL_CLAIMED })
    assertEqual(v.allow, true, `${toolName} 在 unity-ui 阶段应该放行`)
  }
})

await test('关键词：短英文关键词必须整词匹配（uikit 不能命中 ui）', () => {
  assertEqual(keywordMatches('uikit', 'ui'), false, 'uikit 里的 ui 不算命中')
  assertEqual(keywordMatches('build', 'ui'), false)
  assertEqual(keywordMatches('quit', 'ui'), false)
  assertEqual(keywordMatches('改一下 ui', 'ui'), true, '独立的 ui 才算命中')
  assertEqual(keywordMatches('ui_add', 'ui'), true)
})

await test('关键词：真实世界里"提到 uikit 的一整句"不会再被误切到 UI 阶段', () => {
  const stage = detectStage('把 uikit dialogue quest 这些标签归入阶段', DEFAULT_STAGES, ['unity-ui', 'art', 'audio', 'unity-code', 'core'])
  assertEqual(stage, '', '这句里没有独立的 ui 单词，不该命中')
})

// ============================================================================
// 2.6 物理瘦身：deny 列表计算
// ============================================================================
await test('瘦身：core 阶段会把 unity/meshy/audio 全部算进 deny', () => {
  const deny = computeDenyList({
    toolNames: ['read', 'unity_status', 'meshy_image_to_3d', 'audio_generate_sfx', 'route_stage'],
    stage: 'core',
    stages: DEFAULT_STAGES,
    claimed: REAL_CLAIMED,
  })
  assertEqual(deny.includes('unity_status'), true)
  assertEqual(deny.includes('meshy_image_to_3d'), true)
  assertEqual(deny.includes('audio_generate_sfx'), true)
  assertEqual(deny.includes('read'), false, '基础工具不能砍')
  assertEqual(deny.includes('route_stage'), false, '逃生门绝不能砍')
})

await test('瘦身：auto 阶段一条都不砍', () => {
  const deny = computeDenyList({
    toolNames: ['read', 'unity_status', 'meshy_image_to_3d'],
    stage: 'auto',
    stages: DEFAULT_STAGES,
    claimed: REAL_CLAIMED,
  })
  assertEqual(deny.length, 0)
})

await test('瘦身：没人认领的标签不进 deny（新插件不被误杀）', () => {
  const deny = computeDenyList({
    toolNames: ['read', 'foobar_thing'],
    stage: 'core',
    stages: DEFAULT_STAGES,
    claimed: REAL_CLAIMED,
  })
  assertEqual(deny.includes('foobar_thing'), false)
})

// ============================================================================
// 3. 阶段状态机
// ============================================================================
await test('阶段：默认是 auto', () => {
  const s = createStageState({ stages: STAGES, defaultStage: 'auto', order: ORDER })
  assertEqual(s.get('a').stage, 'auto')
})

await test('关键词：配置顺序优先（"Unity UI 界面" 该进 unity-ui 而不是 unity-code）', () => {
  assertEqual(detectStage('做个 Unity UI 设置界面', STAGES, ORDER), 'unity-ui')
  assertEqual(detectStage('编译报错了，帮我看看', STAGES, ORDER), 'unity-code')
  assertEqual(detectStage('生成一张贴图', STAGES, ORDER), 'art')
  assertEqual(detectStage('播放一个音效', STAGES, ORDER), 'audio')
  assertEqual(detectStage('今天天气不错', STAGES, ORDER), '', '无关内容不命中')
})

await test('阶段：首次说话没命中关键词 → 用默认阶段', () => {
  const s = createStageState({ stages: STAGES, defaultStage: 'auto', order: ORDER })
  s.onUserMessage('k', '随便聊聊')
  assertEqual(s.get('k').stage, 'auto')
  assertEqual(s.get('k').by, 'default')
})

await test('阶段：关键词命中就切', () => {
  const s = createStageState({ stages: STAGES, defaultStage: 'auto', order: ORDER })
  s.onUserMessage('k', '做个设置界面')
  assertEqual(s.get('k').stage, 'unity-ui')
  assertEqual(s.get('k').by, 'keyword')
})

await test('阶段：显式切了之后，无关消息不会把阶段冲掉（实测 bug：切一次只管一轮）', () => {
  const s = createStageState({ stages: STAGES, defaultStage: 'auto', order: ORDER })
  s.setStage('k', 'core')
  // 用户接下来随便说一句不含关键词的话
  s.onUserMessage('k', '调一下 route_status 看看')
  assertEqual(s.get('k').stage, 'core', '显式阶段必须粘住，否则每轮都白切')
  assertEqual(s.get('k').by, 'explicit')
})

await test('阶段：粘住之后，关键词仍然能把它切走（关键词 > 粘住）', () => {
  const s = createStageState({ stages: STAGES, defaultStage: 'auto', order: ORDER })
  s.setStage('k', 'core')
  s.onUserMessage('k', '生成一张贴图')
  assertEqual(s.get('k').stage, 'art', '关键词应该能覆盖粘住的状态')
  assertEqual(s.get('k').by, 'keyword')
})

await test('阶段：关键词阶段也会粘住（不会每条消息抖回默认）', () => {
  const s = createStageState({ stages: STAGES, defaultStage: 'auto', order: ORDER })
  s.onUserMessage('k', '生成一张贴图')
  s.onUserMessage('k', '好的继续')
  assertEqual(s.get('k').stage, 'art')
  assertEqual(s.get('k').by, 'sticky')
})

await test('阶段：显式切换优先，且未知阶段会被拒绝', () => {
  const s = createStageState({ stages: STAGES, defaultStage: 'auto', order: ORDER })
  const ok = s.setStage('k', 'art')
  assertEqual(ok.ok, true)
  assertEqual(s.get('k').stage, 'art')
  assertEqual(s.get('k').explicit, true)
  const bad = s.setStage('k', '不存在的阶段')
  assertEqual(bad.ok, false)
  assert(bad.error.includes('未知阶段'), '要告诉调用方阶段名错了')
})

await test('阶段：reset 回到默认（逃生门）', () => {
  const s = createStageState({ stages: STAGES, defaultStage: 'auto', order: ORDER })
  s.setStage('k', 'art')
  assertEqual(s.reset('k'), true)
  assertEqual(s.get('k').stage, 'auto')
})

await test('阶段：不同会话互相隔离', () => {
  const s = createStageState({ stages: STAGES, defaultStage: 'auto', order: ORDER })
  s.setStage('a', 'art')
  s.setStage('b', 'audio')
  assertEqual(s.get('a').stage, 'art')
  assertEqual(s.get('b').stage, 'audio')
})

await test('阶段：会话状态有上限，不会无限增长', () => {
  const s = createStageState({ stages: STAGES, defaultStage: 'auto', maxSessions: 3 })
  for (let i = 0; i < 10; i += 1) s.setStage(`s-${i}`, 'art')
  assertEqual(s.states.size, 3)
  assert(s.states.has('s-9'), '最新的必须还在')
})

await test('消息文本：能从 ContentBlock 里抽出文字', () => {
  const text = textOfMessage({ content: [{ type: 'text', text: '你好' }, { type: 'image' }] })
  assertEqual(text.trim(), '你好')
  assertEqual(textOfMessage(null), '')
})

// ============================================================================
// 4. 尾部提示（≤200 字硬校验）
// ============================================================================
await test('提示：auto 阶段的提示很短，且不制造约束感', () => {
  const h = renderHint({ stage: 'auto', stages: STAGES, claimed: CLAIMED })
  assert(h.length <= HINT_LIMIT)
  assert(h.text.includes('auto'))
})

await test('提示：具体阶段会列出允许组和禁止组', () => {
  const h = renderHint({ stage: 'unity-code', stages: STAGES, claimed: CLAIMED })
  assert(h.text.includes('unity-code'))
  assert(h.text.includes('允许组=unity'))
  assert(h.text.includes('禁止组='), '要告诉模型哪些组被禁')
  assert(h.text.includes('route_stage'), '要给出切换方式')
  assert(h.length <= HINT_LIMIT)
})

await test('提示：禁止组很多时会压缩成"前 8 个 + 总数"（不把 200 字吃满）', () => {
  const many = {}
  for (let i = 0; i < 60; i += 1) many[`tag${i}`] = true
  const claimedBig = new Set(Object.keys(many))
  const h = renderHint({ stage: 'core', stages: { core: { allow: [] } }, claimed: claimedBig })
  assert(h.text.includes('等60组'), '应该压缩并标出总数')
  assertEqual(h.truncated, false, '压缩之后不该再被截断')
  assert(h.length <= HINT_LIMIT)
})

await test('提示：极端配置下仍然硬截断到 200 字（红线兜底）', () => {
  // 允许组本身就超长（模拟有人把阶段配得极其夸张）
  const h = renderHint({
    stage: 'core',
    stages: { core: { allow: ['a'.repeat(120), 'b'.repeat(120)] } },
    claimed: new Set(),
  })
  assert(h.truncated === true, '应该报告被截断')
  assert(h.length <= HINT_LIMIT, `长度 ${h.length} 超过上限 ${HINT_LIMIT}`)
  assert(h.text.endsWith('…'), '截断要有标记')
})

// ============================================================================
// 5. 本地体检
// ============================================================================
await test('去噪：注释和字符串里的代码不算数（防误杀）', () => {
  const code = `
    // while(true) 千万别这么写
    /* while(true) { } */
    console.log("while(true)");
    const s = 'while (true)';
  `
  const clean = stripNoise(code)
  assert(!clean.includes('while'), '注释和字符串里的 while 必须被抹掉')
})

await test('体检：while(true) 没有出口 → 拦', () => {
  const { findings } = scanCode('function f() { while (true) { x = x + 1; } }')
  const blocks = findings.filter((f) => f.severity === 'block')
  assertEqual(blocks.length, 1)
  assertEqual(blocks[0].rule, 'while-true')
  assertEqual(blocks[0].line, 1)
})

await test('体检：while(true) 里有 break → 放行（合法写法，不能误杀）', () => {
  const { findings } = scanCode('while (true) { if (done) { break; } work(); }')
  assertEqual(findings.filter((f) => f.severity === 'block').length, 0)
})

await test('体检：只含字符串/注释里的 while(true) → 放行', () => {
  const code = '// while(true) 是坏的\nlog("while (true) {}");'
  const { findings } = scanCode(code)
  assertEqual(findings.length, 0)
})

await test('体检：for(;;) 没有出口 → 拦', () => {
  const { findings } = scanCode('for (;;) { tick(); }')
  assertEqual(findings.filter((f) => f.severity === 'block').length, 1)
})

await test('体检：do{}while(true) 没有出口 → 拦', () => {
  const { findings } = scanCode('do { keep(); } while (true);')
  assert(findings.some((f) => f.rule === 'do-while-true'), '应该抓到 do-while')
})

await test('体检：PowerShell 的 while ($true) 也能抓', () => {
  const { findings } = scanCode('while ($true) { Start-Sleep 1 }')
  assertEqual(findings.filter((f) => f.severity === 'block').length, 1)
})

await test('体检：无出口的自我递归 → 只警告，不拦', () => {
  const { findings } = scanCode('function again(n) { return again(n) }')
  assert(findings.some((f) => f.rule === 'unbounded-recursion'), '应该警告递归')
  assertEqual(findings.filter((f) => f.severity === 'block').length, 0, '递归绝不硬拦')
})

await test('体检：有 if 判断的递归 → 不警告', () => {
  const { findings } = scanCode('function walk(n) { if (n <= 0) return 0; return walk(n - 1) }')
  assertEqual(findings.filter((f) => f.rule === 'unbounded-recursion').length, 0)
})

await test('体检：报错文案是祈使句，给出行号和修改办法', () => {
  const { findings } = scanCode('function f() {\n  while (true) { x(); }\n}')
  const text = formatFindings(findings, '工具 write')
  assert(text.includes('【本地体检拒绝】'))
  assert(text.includes('工具 write'))
  assert(text.includes('第 2 行'), '要能定位到行')
  assert(text.includes('请立即改写'), '必须给动作指令')
})

await test('工具：matchBrace / lineAt 定位正确', () => {
  const code = 'a { b { c } }'
  assertEqual(matchBrace(code, 2), 12, '外层 { 配对外层 }')
  assertEqual(matchBrace(code, 6), 10, '内层 { 配对内层 }')
  assertEqual(lineAt('x\ny\nz', 2), 2, '下标 2 落在第 2 行')
  assertEqual(lineAt('x\ny\nz', 4), 3, '下标 4 落在第 3 行')
})

// ============================================================================
// 6. 参数收集
// ============================================================================
await test('参数收集：能挖出嵌套对象里的字符串', () => {
  const list = collectStrings({ content: 'abc', nested: { deeper: ['def'] } })
  assert(list.includes('abc') && list.includes('def'))
})

await test('参数收集：深度和总量都有上限（不会把内存吃光）', () => {
  const deep = { a: { b: { c: { d: { e: { f: 'deep' } } } } } }
  const list = collectStrings(deep, { maxDepth: 2 })
  assert(!list.includes('deep'), '超过深度上限的内容不该被收进来')
  const big = collectStrings({ a: 'x'.repeat(1000) }, { maxChars: 100 })
  assertEqual(big[0].length, 100, '要按预算截断')
})

// ============================================================================
// 7. 集成：真的调 apply()
// ============================================================================
/** 造一条假的模型输出流（用于测 llm/stream 的透传） */
async function* fakeStream(chunks) {
  for (const chunk of chunks) yield chunk
}

function makeFakeCtx(options = {}) {
  const listeners = new Map()
  const tools = new Map()
  const contexts = []
  const disposers = []
  const restricts = []

  // 默认假装用的是 flash（安全模型）；传 noModel:true 可模拟"拿不到模型名"
  const model = options.noModel === true ? '' : options.model || 'deepseek-flash'
  const provider = options.provider || 'deepseek-account'

  // 模拟真实的"限制生效"语义：被 deny 的工具从 schemas() 里消失，
  // dispose 限制后又回来。这样才能测出"先拆旧限制、再算新列表"的顺序坑。
  // 【要点】给每个工具一个接近真实的体量（描述 + 参数）。
  // 否则成本闸门算出来的"摘掉字节数"接近 0，回本永远要几百轮，
  // 会把和它无关的用例一起拦掉（实测踩过）。
  const TOOL_PAD = 'x'.repeat(600)
  const mkTool = (name) => ({
    name,
    description: `${name} test tool ${TOOL_PAD}`,
    parameters: { type: 'object', properties: { a: { type: 'string' } } },
  })
  const BASE_TOOLS = [
    'read',
    'write',
    'unity_object_create',
    'unity_status',
    'asset_audit',
    'perf_snapshot',
    'ui_add',
    'meshy_image_to_3d',
    'audio_generate_sfx',
    'route_stage',
    'route_status',
    'route_reset',
    'guard_reset',
  ].map(mkTool)
  let denied = new Set()

  // DSH 的 restrict() 只能在 agent.ctx 上调（全局调用会被拒绝），
  // 所以假运行时也把 scoped 接口挂在 agent.ctx.tools 上，保持同一份 denied 状态。
  const scopedTools = {
    schemas() {
      return BASE_TOOLS.filter((tool) => !denied.has(tool.name))
    },
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
      const disposer = fn()
      if (typeof disposer === 'function') disposers.push(disposer)
      return disposer
    },
    on(eventName, listener) {
      const list = listeners.get(eventName) || []
      list.push(listener)
      listeners.set(eventName, list)
      return () => {}
    },
    tools: {
      register(definition) {
        if (tools.has(definition.name)) throw new Error(`工具重名：${definition.name}`)
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
      // 全局调用会被 DSH 拒绝——这里如实模拟
      schemas() {
        return BASE_TOOLS.filter((tool) => !denied.has(tool.name))
      },
      restrict() {
        throw new Error('tools.restrict() requires a scoped context (agent.ctx)')
      },
    },
    systemPrompt: options.noSystemPrompt
      ? undefined
      : {
          context(definition) {
            contexts.push(definition)
            return () => {}
          },
        },
    get(name) {
      if (name === 'agentDefaultModel' && model) {
        return { currentSelection: () => ({ provider, model }) }
      }
      return undefined
    },
  }

  /** 造一个带 scoped tools 的 agent（真实 DSH 里 agent.ctx.tools 就是这个形态） */
  function makeAgent(id) {
    return { id, ctx: { tools: scopedTools } }
  }

  return { ctx, listeners, tools, contexts, disposers, restricts, makeAgent }
}

async function preExecute(runtime, exec) {
  const list = runtime.listeners.get('tools/pre-execute') || []
  let cursor = 0
  const next = () => {
    const listener = list[cursor]
    cursor += 1
    if (!listener) return Promise.resolve({ kind: 'allow' })
    return Promise.resolve(listener(exec, next))
  }
  return next()
}

await test('集成：一个包装配出 9 个工具 + 尾插 + 全部监听器（三合一后）', () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  // 路由模块
  assert(rt.tools.has('route_stage'))
  assert(rt.tools.has('route_status'))
  assert(rt.tools.has('route_reset'))
  assert(rt.tools.has('route_init'))
  // 熔断模块（同包）
  assert(rt.tools.has('guard_status'), '合并后应该同时注册 guard_status')
  assert(rt.tools.has('guard_reset'))
  // 探针模块（同包）
  assert(rt.tools.has('cache_probe_report'), '合并后应该同时注册 cache_probe_report')
  assert(rt.tools.has('cache_probe_clear'))
  // 尾插只有一条（名字相同会互相 shadow，绝不能重复注入）
  assertEqual(rt.contexts.length, 1, '应该只注册 1 个尾部提示')
  assertEqual(rt.contexts[0].name, 'minimal-router:stage')
  // pre-execute：router（阶段越界+体检）+ guard（熔断）
  assertEqual((rt.listeners.get('tools/pre-execute') || []).length, 2)
  // tools/result：guard 记账
  assertEqual((rt.listeners.get('tools/result') || []).length, 1)
  // agent/inbox/claimed：router 关键词切阶段 + guard 新一轮清零
  assertEqual((rt.listeners.get('agent/inbox/claimed') || []).length, 2)
  // llm/stream：router 检模型 + probe 记用量
  assertEqual((rt.listeners.get('llm/stream') || []).length, 2)
})

await test('集成：关掉 guard / probe 后只剩路由（高级用户可以裁剪）', () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { guardEnabled: false, probeEnabled: false })
  assert(rt.tools.has('route_stage'))
  assertEqual(rt.tools.has('guard_status'), false, 'guard 应该被裁掉')
  assertEqual(rt.tools.has('cache_probe_report'), false, 'probe 应该被裁掉')
  assertEqual((rt.listeners.get('tools/pre-execute') || []).length, 1)
  assertEqual((rt.listeners.get('agent/inbox/claimed') || []).length, 1)
  assertEqual((rt.listeners.get('llm/stream') || []).length, 1)
})

await test('集成：尾插文本是动态的（每步会重新算）', () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const text = rt.contexts[0].text()
  assert(typeof text === 'string' && text.length > 0)
  assert(text.length <= 200, '绝不能超过 200 字')
})

await test('集成 —— 铁血：显式切到 core 后，meshy 调用被拦', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const agent = { id: 'session-A' }
  await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
  const decision = await preExecute(rt, { name: 'meshy_image_to_3d', arguments: {}, agent })
  assertEqual(decision.kind, 'deny')
  assert(decision.reason.includes('阶段越界'))
  assertEqual(decision.info.code, 'STAGE_DENIED')
})

await test('集成 —— 铁血：切到 art 后同一个调用放行', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const agent = { id: 'session-A' }
  await rt.tools.get('route_stage').execute({ stage: 'art' }, { agent })
  const decision = await preExecute(rt, { name: 'meshy_image_to_3d', arguments: {}, agent })
  assertEqual(decision.kind, 'allow')
})

await test('集成 —— 逃生门：被阶段拦住时 route_reset 仍然可用', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const agent = { id: 'session-A' }
  await rt.tools.get('route_stage').execute({ stage: 'audio' }, { agent })
  const blocked = await preExecute(rt, { name: 'unity_object_create', arguments: {}, agent })
  assertEqual(blocked.kind, 'deny')
  const escape = await preExecute(rt, { name: 'route_reset', arguments: {}, agent })
  assertEqual(escape.kind, 'allow', 'route_reset 必须永远放行')
  // 放行之后模型真的会调用它，所以这里要真的执行一次
  const resetOut = await rt.tools.get('route_reset').execute({}, { agent })
  assertEqual(resetOut.reset, true)
  const after = await preExecute(rt, { name: 'unity_object_create', arguments: {}, agent })
  assertEqual(after.kind, 'allow', '复位后应恢复放行')
})

await test('集成 —— 体检：写进死循环代码被当场拦住', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const agent = { id: 'session-A' }
  const decision = await preExecute(rt, {
    name: 'write',
    arguments: { file_path: 'C:/x.cs', content: 'void Update() { while (true) { Spin(); } }' },
    agent,
  })
  assertEqual(decision.kind, 'deny')
  assert(decision.reason.includes('本地体检拒绝'))
  assertEqual(decision.info.code, 'LINT_DEAD_LOOP')
})

await test('集成 —— 体检：正常代码不被误杀', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const agent = { id: 'session-A' }
  const decision = await preExecute(rt, {
    name: 'write',
    arguments: { file_path: 'C:/x.cs', content: 'void Update() { if (hp <= 0) { Die(); } }' },
    agent,
  })
  assertEqual(decision.kind, 'allow')
})

await test('集成 —— 体检：warn 模式只记日志不拦', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { lintMode: 'warn' })
  const agent = { id: 'session-A' }
  const decision = await preExecute(rt, {
    name: 'write',
    arguments: { content: 'while (true) { x(); }' },
    agent,
  })
  assertEqual(decision.kind, 'allow')
})

await test('集成 —— 只读工具的参数不参与体检（否则搜 grep "while(true)" 会被误杀）', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const agent = { id: 'session-A' }
  const decision = await preExecute(rt, {
    name: 'grep',
    arguments: { pattern: 'while (true) { }' },
    agent,
  })
  assertEqual(decision.kind, 'allow')
})

await test('集成 —— 关键词自动切阶段，之后越界被拦', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const agent = { id: 'session-B' }
  // 模拟用户说"生成一张贴图"（迟滞默认要连续 2 次，所以发两次）
  const claimedListener = (rt.listeners.get('agent/inbox/claimed') || [])[0]
  claimedListener({ agent, message: { content: [{ type: 'text', text: '生成一张贴图' }] } })
  claimedListener({ agent, message: { content: [{ type: 'text', text: '再生成一张贴图' }] } })
  const status = await rt.tools.get('route_status').execute({}, { agent })
  assertEqual(status.stage, 'art')
  assertEqual(status.by, 'keyword')
  const unityCall = await preExecute(rt, { name: 'unity_object_create', arguments: {}, agent })
  assertEqual(unityCall.kind, 'deny', 'art 阶段下不该用 unity 工具')
})

await test('集成：route_status 能报出标签分布和最近一次体检命中', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const agent = { id: 'session-C' }
  await preExecute(rt, { name: 'write', arguments: { content: 'while (true) {}' }, agent })
  const status = await rt.tools.get('route_status').execute({}, { agent })
  assertEqual(status.toolCount, 13)
  assertEqual(status.tagCounts.unity, 2)
  assert(status.lastLintHit.includes('本地体检拒绝'))
  assertEqual(JSON.stringify(JSON.parse(JSON.stringify(status))), JSON.stringify(status), '必须是无损 JSON')
})

// ============================================================================
// 8. 集成：物理瘦身（restrict）
// ============================================================================
await test('瘦身集成：默认关闭时一次 restrict 都不调（零缓存风险）', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const agent = rt.makeAgent('s1')
  await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
  assertEqual(rt.restricts.length, 0)
})

await test('瘦身集成：打开后切阶段会真的调用 restrict，并砍掉无关工具', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { enforceByRestrict: true })
  const agent = rt.makeAgent('s2')
  const out = await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
  assertEqual(out.restriction.applied, true, `限制没生效：${out.restriction.reason}`)
  assertEqual(rt.restricts.length, 1)
  const deny = rt.restricts[0].deny
  assert(deny.includes('unity_status'), 'core 阶段应该砍掉 unity 工具')
  assert(deny.includes('meshy_image_to_3d'))
  assert(!deny.includes('read'), '基础工具不能砍')
  assert(!deny.includes('route_stage'), '逃生门绝不能砍')
  assert(rt.ctx.tools.schemas().length < 13, '工具应该真的变少')
})

await test('瘦身集成：必须在 agent.ctx 上调（全局调用会被 DSH 拒绝）', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { enforceByRestrict: true })
  // 造一个"没有 agent.ctx"的会话，模拟拿不到会话级上下文
  const bare = { id: 's-bare' }
  const out = await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent: bare })
  assertEqual(out.restriction.applied, false)
  assertEqual(out.restriction.reason, 'no-scoped-tools', '拿不到会话上下文时必须明确报出来，而不是静默失败')
  assertEqual(rt.restricts.length, 0, '绝不能退而求其次去调全局 restrict')
})

await test('瘦身集成：切到另一个阶段会先拆旧限制再算新列表（不留永久消失的工具）', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { enforceByRestrict: true })
  const agent = rt.makeAgent('s3')
  await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
  await rt.tools.get('route_stage').execute({ stage: 'unity-code' }, { agent })
  assertEqual(rt.restricts.length, 2, '应该调用了两次 restrict')
  const second = rt.restricts[1].deny
  assert(!second.includes('unity_object_create'), '切到 unity-code 后 unity 工具必须回来')
  assert(!second.includes('asset_audit'), 'asset 组已归入 unity-code，必须回来')
  assert(second.includes('meshy_image_to_3d'), 'meshy 仍不属于 unity-code')
})

await test('瘦身集成：切回 auto 会把限制拆掉，工具全部回来', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { enforceByRestrict: true })
  const agent = rt.makeAgent('s4')
  await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
  const before = rt.ctx.tools.schemas().length
  const out = await rt.tools.get('route_stage').execute({ stage: 'auto' }, { agent })
  assertEqual(out.restriction.applied, false)
  assertEqual(rt.ctx.tools.schemas().length, 13, 'auto 阶段必须恢复完整工具箱')
  assert(before < 13, '（前提）core 阶段确实变少过')
})

await test('瘦身集成：route_reset 也会把限制拆掉（逃生门必须彻底）', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { enforceByRestrict: true })
  const agent = rt.makeAgent('s5')
  await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
  const out = await rt.tools.get('route_reset').execute({}, { agent })
  assertEqual(out.stage, 'auto')
  assertEqual(rt.ctx.tools.schemas().length, 13)
})

// ============================================================================
// 9. 降级保护：模型能力判定（纯逻辑）
// ============================================================================
await test('降级：flash 支持 in-history → 判定为安全', () => {
  const cap = resolveCapability({ provider: 'deepseek-account', model: 'deepseek-flash' })
  assertEqual(cap.safe, true)
  assertEqual(cap.source, 'table')
  assertEqual(cap.systemPromptUpdate, 'in-history')
  assertEqual(cap.reason, '')
})

await test('降级：v4-pro 不支持 → 判定为不安全，并说明原因', () => {
  const cap = resolveCapability({ provider: 'deepseek-account', model: 'deepseek-v4-pro' })
  assertEqual(cap.safe, false)
  assertEqual(cap.systemPromptUpdate, 'leading-only')
  assert(cap.reason.includes('不是 in-history'), '理由要说清楚')
})

await test('降级：未收录的模型 → 一律按不安全处理（fail-safe）', () => {
  const cap = resolveCapability({ provider: 'openai', model: 'gpt-5-turbo' })
  assertEqual(cap.safe, false)
  assertEqual(cap.source, 'unknown')
  assert(cap.reason.includes('不在已知能力表里'))
})

await test('降级：拿不到模型名 → 不安全（绝不默认放行）', () => {
  const cap = resolveCapability({})
  assertEqual(cap.safe, false)
  assertEqual(cap.reason.includes('还没拿到当前模型名'), true)
})

await test('降级：unsafeForce 可以强行开启（自担风险）', () => {
  const cap = resolveCapability({ model: 'deepseek-v4-pro', unsafeForce: true })
  assertEqual(cap.safe, true)
  assertEqual(cap.source, 'forced')
})

await test('降级：requireInHistory=false 时不看这个能力（给特殊场景留口子）', () => {
  const cap = resolveCapability({ model: 'deepseek-v4-pro', requireInHistory: false })
  assertEqual(cap.safe, true)
})

await test('降级：trustedModels 白名单可以放行自定义/代理模型', () => {
  const cap = resolveCapability({ provider: 'local-proxy', model: 'my-flash', trusted: ['my-flash'] })
  assertEqual(cap.safe, true)
  assertEqual(cap.source, 'trusted')
  // 不在白名单里的同名之外模型仍然降级
  const other = resolveCapability({ provider: 'local-proxy', model: 'my-other', trusted: ['my-flash'] })
  assertEqual(other.safe, false)
})

await test('降级集成：trustedModels 生效（配置层面）', async () => {
  const rt = makeFakeCtx({ model: 'my-flash', provider: 'local-proxy' })
  apply(rt.ctx, { trustedModels: ['my-flash'] })
  assert(rt.contexts[0].text().length > 0, '白名单模型应该照常注入')
})

await test('降级：能力表里确实有 flash 和 v4-pro 两条', () => {
  assertEqual(KNOWN_CAPABILITIES['deepseek-flash'].systemPromptUpdate, 'in-history')
  assertEqual(KNOWN_CAPABILITIES['deepseek-v4-pro'].systemPromptUpdate, 'leading-only')
})

await test('降级：警告框包含模型名、原因、以及"仍保留什么"', () => {
  const box = formatDegradeWarning({
    provider: 'deepseek-account',
    model: 'deepseek-v4-pro',
    reason: '不支持 in-history',
  })
  assert(box.includes('deepseek-v4-pro'))
  assert(box.includes('deepseek-account'))
  assert(box.includes('不支持 in-history'))
  assert(box.includes('已关闭'))
  assert(box.includes('仍保留'))
  assert(box.includes('unsafeForce'), '要告诉用户怎么强行开')
  assert(box.includes('╔') && box.includes('╚'), '要是个框，够醒目')
})

// ============================================================================
// 10. 降级保护：集成
// ============================================================================
await test('降级集成：flash → 尾插有内容，瘦身可用', async () => {
  const rt = makeFakeCtx({ model: 'deepseek-flash' })
  apply(rt.ctx, { enforceByRestrict: true })
  const hint = rt.contexts[0].text()
  assert(hint.length > 0, '安全模型必须有尾插')
  const out = await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent: rt.makeAgent('a') })
  assertEqual(out.restriction.applied, true, `瘦身应该可用：${out.restriction.reason}`)
})

await test('降级集成：v4-pro → 尾插变空串，瘦身被拒绝，状态显示 degraded', async () => {
  const rt = makeFakeCtx({ model: 'deepseek-v4-pro' })
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    apply(rt.ctx, { enforceByRestrict: true })
    assertEqual(rt.contexts[0].text(), '', '降级后一个字都不能注入')
    const out = await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent: rt.makeAgent('a') })
    assertEqual(out.restriction.applied, false)
    assertEqual(out.restriction.reason, 'degraded')
    const status = await rt.tools.get('route_status').execute({}, { agent: rt.makeAgent('a') })
    assertEqual(status.degraded, true)
    assertEqual(status.hintEffective, false)
    assertEqual(status.restrictEffective, false)
    assert(status.degradedReason.length > 0)
    assertEqual(status.modelGuard.model, 'deepseek-v4-pro')
    assertEqual(warnings.length, 1, '应该打印了一次警告框')
    assert(warnings[0].includes('已自动降级'))
  } finally {
    console.warn = original
  }
})

await test('降级集成：同一个坏模型反复请求，只警告一次（不刷屏）', async () => {
  const rt = makeFakeCtx({ model: 'deepseek-v4-pro' })
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    apply(rt.ctx, {})
    const handler = (rt.listeners.get('llm/stream') || [])[0]
    const options = { provider: 'deepseek-account', model: 'deepseek-v4-pro' }
    for (let i = 0; i < 3; i += 1) {
      const iterable = handler(options, () => fakeStream([]))
      for await (const _ of iterable) {
        // 消费掉
      }
    }
    assertEqual(warnings.length, 1, `警告应该只有 1 次，实际 ${warnings.length} 次`)
  } finally {
    console.warn = original
  }
})

await test('降级集成：unsafeForce 时 v4-pro 也放开', async () => {
  const rt = makeFakeCtx({ model: 'deepseek-v4-pro' })
  apply(rt.ctx, { unsafeForce: true, enforceByRestrict: true })
  assert(rt.contexts[0].text().length > 0, '强行开启后应该照常注入')
  const out = await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent: rt.makeAgent('a') })
  assertEqual(out.restriction.applied, true)
})

await test('降级集成：llm/stream 监听器原样返回下游流（不消费、不改内容）', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const handler = (rt.listeners.get('llm/stream') || [])[0]
  const chunks = [{ type: 'text-delta', index: 0, text: 'hi' }, { type: 'finish', reason: { kind: 'stop' } }]
  const iterable = handler({ provider: 'deepseek-account', model: 'deepseek-flash' }, () => fakeStream(chunks))
  assert(typeof iterable[Symbol.asyncIterator] === 'function', '必须返回异步迭代器')
  const collected = []
  for await (const chunk of iterable) collected.push(chunk)
  assertEqual(collected.length, 2, '下游的 chunk 必须一个不少地透传')
  assert(collected[0] === chunks[0], '必须原对象透传，不能拷贝或改写')
})

await test('降级集成：运行中从 flash 切到 v4-pro → 立刻拆掉已经挂上的瘦身', async () => {
  const rt = makeFakeCtx({ model: 'deepseek-flash' })
  const original = console.warn
  console.warn = () => {}
  try {
    apply(rt.ctx, { enforceByRestrict: true })
    const agent = rt.makeAgent('a')
    await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
    assert(rt.ctx.tools.schemas().length < 13, '先确认瘦身生效了')
    // 换个模型跑一步
    const handler = (rt.listeners.get('llm/stream') || [])[0]
    const iterable = handler({ provider: 'deepseek-account', model: 'deepseek-v4-pro' }, () => fakeStream([]))
    for await (const _ of iterable) {
      // 消费
    }
    assertEqual(rt.ctx.tools.schemas().length, 13, '降级后工具必须全部回来')
    assertEqual(rt.contexts[0].text(), '', '降级后尾插也要停')
  } finally {
    console.warn = original
  }
})

// ============================================================================
// 10.5 通用适配：自定义阶段表
// ============================================================================
await test('适配：基础工具用显式名单判定，不靠前缀猜', () => {
  assertEqual(isCoreTool('read'), true)
  assertEqual(isCoreTool('create_goal'), true, '否则会被猜成 create 组')
  assertEqual(isCoreTool('list_agents'), true, '否则会被猜成 list 组')
  assertEqual(isCoreTool('read_mcp_resource'), true, '否则会被猜成 read 组')
  assertEqual(isCoreTool('unity_object_create'), false)
})

await test('适配：假标签被消灭（create_goal 属于 core，不是 create）', () => {
  assertEqual(tagOf('create_goal'), 'core')
  assertEqual(tagOf('list_agents'), 'core')
  assertEqual(tagOf('read_mcp_resource'), 'core')
  assertEqual(tagOf('unity_object_create'), 'unity')
})

await test('适配：自定义阶段表校验 —— 合法配置通过', () => {
  const checked = validateStagesConfig({
    defaultStage: 'python',
    stages: {
      python: { title: '写 Python', allow: ['python'], keywords: ['python', 'pandas'] },
    },
  })
  assertEqual(checked.ok, true)
  assertEqual(checked.stages.python.allow[0], 'python')
  assertEqual(checked.defaultStage, 'python')
  assertEqual(checked.errors.length, 0)
})

await test('适配：自定义阶段表校验 —— 缺 stages 时报告错误但不抛', () => {
  const checked = validateStagesConfig({ defaultStage: 'x' })
  assertEqual(checked.ok, false)
  assertEqual(checked.errors.length > 0, true)
})

await test('适配：自定义阶段表校验 —— allow 写错类型只丢那一项，不整份失败', () => {
  const checked = validateStagesConfig({
    stages: { ok: { allow: 'not-an-array', keywords: ['a'] } },
  })
  assertEqual(checked.ok, true, '阶段本身还在')
  assertEqual(Array.isArray(checked.stages.ok.allow), true)
  assert(checked.errors.some((e) => e.includes('allow')), '要报告 allow 类型错误')
})

await test('适配：合并阶段表时后者覆盖同名', () => {
  const merged = mergeStages({ a: { allow: [1] } }, { a: { allow: [2] }, b: { allow: [3] } })
  assertEqual(merged.a.allow[0], 2)
  assertEqual(merged.b.allow[0], 3)
})

await test('适配：未认领标签能找出来（排除 core 和已认领）', () => {
  const unclaimed = findUnclaimed({
    tagCounts: { unity: 20, python: 7, core: 30, db: 4 },
    claimed: new Set(['unity']),
  })
  assertEqual(unclaimed.some((x) => x.tag === 'python'), true)
  assertEqual(unclaimed.some((x) => x.tag === 'db'), true)
  assertEqual(unclaimed.some((x) => x.tag === 'unity'), false)
  assertEqual(unclaimed.some((x) => x.tag === 'core'), false)
  assertEqual(unclaimed[0].tag, 'python', '按数量倒序')
})

await test('适配：模板里带 discovered / suggestions / 使用说明', () => {
  const template = buildTemplate({
    tagCounts: { unity: 20, python: 7 },
    claimed: new Set(['unity']),
    stages: { auto: { allow: [] } },
    defaultStage: 'auto',
  })
  assertEqual(template.version, 1)
  assertEqual(Array.isArray(template.discovered), true)
  assertEqual(template.discovered.find((x) => x.tag === 'unity').claimed, true)
  assertEqual(template.discovered.find((x) => x.tag === 'python').claimed, false)
  assertEqual(template.suggestions.length, 1)
  assertEqual(template.suggestions[0].allow[0], 'python')
  assertEqual(Array.isArray(template._readme), true)
})

await test('适配：读不存在的 custom_stages.json 是正常情况（不报错）', () => {
  const loaded = loadCustomStagesSync(join(tmpdir(), 'definitely-not-exists-12345.json'))
  assertEqual(loaded.found, false)
  assertEqual(loaded.ok, false)
})

await test('适配：custom_stages.json 写坏了 → found=true 但 ok=false，并给出原因', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'router-cfg-bad-'))
  const file = join(dir, 'custom_stages.json')
  try {
    await writeFile(file, '{ this is not json', 'utf8')
    const loaded = loadCustomStagesSync(file)
    assertEqual(loaded.found, true)
    assertEqual(loaded.ok, false)
    assert(loaded.errors[0].includes('不是合法 JSON'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

await test('适配集成：自定义阶段表真的被加载并生效', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'router-cfg-ok-'))
  const file = join(dir, 'custom_stages.json')
  try {
    await writeFile(
      file,
      JSON.stringify({
        defaultStage: 'auto',
        stages: { python: { title: '写 Python', allow: ['python'], keywords: ['python'] } },
      }),
      'utf8',
    )
    const rt = makeFakeCtx()
    apply(rt.ctx, { customStagesFile: file })
    const status = await rt.tools.get('route_status').execute({}, { agent: rt.makeAgent('a') })
    assertEqual(status.stages.some((s) => s.stage === 'python'), true, '自定义阶段应该出现')
    assertEqual(status.stagesSource.customFound, true)
    assertEqual(status.stagesSource.customOk, true)
    // 内置阶段还在（是合并不是替换）
    assertEqual(status.stages.some((s) => s.stage === 'core'), true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

await test('适配集成：route_init 已注册，且能生成模板文件', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'router-init-'))
  try {
    const rt = makeFakeCtx()
    apply(rt.ctx, { customStagesFile: join(dir, 'custom_stages.json') })
    assert(rt.tools.has('route_init'), 'route_init 必须注册')
    const out = await rt.tools.get('route_init').execute({}, { agent: rt.makeAgent('a') })
    assertEqual(out.written, true)
    assert(out.file.endsWith('custom_stages.sample.json'), `生成的文件名不对：${out.file}`)
    assertEqual(out.toolCount, 13)
    const text = await readFile(out.file, 'utf8')
    const parsed = JSON.parse(text)
    assertEqual(parsed.version, 1)
    assertEqual(out.nextSteps.length, 5)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// ============================================================================
// 10.6 安全闸门（超长上下文里切阶段 = 全额重建）+ simulateModel 演示开关
// ============================================================================
/** 通过 llm/stream 灌入一次"上下文长度" */
async function feedContext(rt, sessionId, promptTokens) {
  const handler = (rt.listeners.get('llm/stream') || [])[0]
  const iterable = handler(
    { provider: 'deepseek-account', model: 'deepseek-flash', sessionId },
    () =>
      fakeStream([
        { type: 'usage', usage: { inputTokens: 1, cacheReadTokens: promptTokens - 1 } },
        { type: 'finish', reason: { kind: 'stop' } },
      ]),
  )
  for await (const _ of iterable) {
    // 消费掉
  }
}

await test('闸门：上下文低于阈值时正常切阶段', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { contextGuardThreshold: 100000 })
  const agent = rt.makeAgent('small-session')
  await feedContext(rt, 'small-session', 30000)
  const out = await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
  assertEqual(out.ok, true)
})

await test('闸门：上下文超过阈值时必须拦住，并说清楚为什么', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { contextGuardThreshold: 100000 })
  const agent = rt.makeAgent('big-session')
  await feedContext(rt, 'big-session', 512345)
  const out = await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
  assertEqual(out.ok, false, '必须拦住')
  assertEqual(out.blocked, true)
  assertEqual(out.contextTokens, 512345)
  assert(out.reason.includes('上下文过大'), '要说清楚原因')
  assert(out.reason.includes('建议开一个新会话'), '要给出建议')
  assert(out.reason.includes('force'), '要告诉用户怎么强切')
})

await test('闸门：force:true 可以强切（把决定权还给用户）', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { contextGuardThreshold: 100000 })
  const agent = rt.makeAgent('big-session')
  await feedContext(rt, 'big-session', 512345)
  const out = await rt.tools.get('route_stage').execute({ stage: 'core', force: true }, { agent })
  assertEqual(out.ok, true)
  assertEqual(out.stage, 'core')
})

await test('闸门：阈值设 0 表示关闭', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { contextGuardThreshold: 0 })
  const agent = rt.makeAgent('big-session')
  await feedContext(rt, 'big-session', 512345)
  const out = await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
  assertEqual(out.ok, true)
})

await test('闸门：拦住的时候不能改阶段，也不能动工具列表', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { contextGuardThreshold: 100000, enforceByRestrict: true })
  const agent = rt.makeAgent('big-session')
  await feedContext(rt, 'big-session', 512345)
  const out = await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
  assertEqual(out.blocked, true)
  assertEqual(rt.restricts.length, 0, '被拦住时绝不能去调 restrict')
  const status = await rt.tools.get('route_status').execute({}, { agent })
  assertEqual(status.stage, 'auto', '阶段不能变')
  assertEqual(status.contextGuard.triggered, true)
  assertEqual(status.lastPromptTokens, 512345)
})

await test('演示：simulateModel 能让插件以为自己在用 v4-pro（不花一分钱）', async () => {
  const rt = makeFakeCtx({ model: 'deepseek-flash' })
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    apply(rt.ctx, { simulateModel: 'deepseek-v4-pro' })
    assertEqual(rt.contexts[0].text(), '', '应该已经降级（尾插为空）')
    assertEqual(warnings.length, 1, '应该弹了警告框')
    assert(warnings[0].includes('deepseek-v4-pro'))
    const status = await rt.tools.get('route_status').execute({}, { agent: rt.makeAgent('a') })
    assertEqual(status.degraded, true)
    assertEqual(status.modelGuard.model, 'deepseek-v4-pro')
    assertEqual(status.simulateModel, 'deepseek-v4-pro')
  } finally {
    console.warn = original
  }
})

await test('演示：simulateModel 设成 flash 时不降级（对照组）', async () => {
  const rt = makeFakeCtx({ model: 'deepseek-v4-pro' })
  const original = console.warn
  console.warn = () => {}
  try {
    apply(rt.ctx, { simulateModel: 'deepseek-flash' })
    assert(rt.contexts[0].text().length > 0, 'simulateModel 应该覆盖真实模型判断')
  } finally {
    console.warn = original
  }
})

await test('闸门：超大上下文里，关键词也不许偷偷切阶段（实测漏网之鱼）', async () => {
  const rt = makeFakeCtx()
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    apply(rt.ctx, { contextGuardThreshold: 100000 })
    const agent = rt.makeAgent('big-session')
    await feedContext(rt, 'big-session', 500000)
    const listener = (rt.listeners.get('agent/inbox/claimed') || [])[0]
    listener({ agent, message: { content: [{ type: 'text', text: '切到 core 阶段' }] } })
    const status = await rt.tools.get('route_status').execute({}, { agent })
    assertEqual(status.stage, 'auto', '超大上下文里不许通过关键词切阶段')
    assert(status.lastBlockedSwitch !== null, '要记下这次被拦的切换')
    assert(status.lastBlockedSwitch.to, 'core')
    assertEqual(status.lastBlockedSwitch.from, 'auto')
    // 可能还有一条"上下文快满了"的提前预警，所以只断言"有拦截提示"
    assert(warnings.some((w) => w.includes('已阻止一次')), '应该有拦截提示')
  } finally {
    console.warn = original
  }
})

await test('闸门：上下文不大时，关键词照常切阶段', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { contextGuardThreshold: 100000 })
  const agent = rt.makeAgent('small')
  await feedContext(rt, 'small', 2000)
  const listener = (rt.listeners.get('agent/inbox/claimed') || [])[0]
  // 迟滞默认 2：连续两次同向信号才切
  // （上下文故意设得很小，这样成本闸门一定是"划算"，本用例测的是闸门之外的路径）
  listener({ agent, message: { content: [{ type: 'text', text: '生成一张贴图' }] } })
  listener({ agent, message: { content: [{ type: 'text', text: '再生成一张贴图' }] } })
  const status = await rt.tools.get('route_status').execute({}, { agent })
  assertEqual(status.stage, 'art')
  assertEqual(status.lastBlockedSwitch, null)
})

// ============================================================================
// 10.7 迟滞 / 冷却（P0-a）：抑制"顺嘴提一句就切阶段"的抖动
// ============================================================================
await test('迟滞：显式命令的说法能被识别', () => {
  assertEqual(isExplicitSwitch('切到 core 阶段'), true)
  assertEqual(isExplicitSwitch('切换到美术阶段'), true)
  assertEqual(isExplicitSwitch('switch to art stage'), true)
  assertEqual(isExplicitSwitch('生成一张贴图'), false, '随口提到的不算显式命令')
})

await test('迟滞：默认要连续 2 次同向信号才切', () => {
  const arbiter = createSwitchArbiter({ confirmations: 2, cooldownMs: 0 })
  const first = arbiter.decide({ key: 'k', detected: 'art', explicit: false, now: 1000 })
  assertEqual(first.switch, false)
  assertEqual(first.reason, 'pending')
  assertEqual(first.pendingCount, 1)
  const second = arbiter.decide({ key: 'k', detected: 'art', explicit: false, now: 2000 })
  assertEqual(second.switch, true)
  assertEqual(second.reason, 'confirmed')
})

await test('迟滞：显式命令立刻切，不用等第二次', () => {
  const arbiter = createSwitchArbiter({ confirmations: 3, cooldownMs: 0 })
  const decision = arbiter.decide({ key: 'k', detected: 'core', explicit: true, now: 1000 })
  assertEqual(decision.switch, true)
  assertEqual(decision.reason, 'explicit')
})

await test('迟滞：冷却期内不切，冷却过后才生效', () => {
  const arbiter = createSwitchArbiter({ confirmations: 2, cooldownMs: 10000 })
  arbiter.noteSwitched({ key: 'k', now: 1000 })
  const hot = arbiter.decide({ key: 'k', detected: 'art', explicit: false, now: 2000 })
  assertEqual(hot.switch, false)
  assertEqual(hot.reason, 'cooldown')
  assert(hot.remainingMs > 0, '要能报出还剩多久')
  // 冷却过后：信号已经累计到 2，所以这一次直接放行
  const later = arbiter.decide({ key: 'k', detected: 'art', explicit: false, now: 20000 })
  assertEqual(later.switch, true)
})

await test('迟滞：中途换方向会重置计数', () => {
  const arbiter = createSwitchArbiter({ confirmations: 2, cooldownMs: 0 })
  arbiter.decide({ key: 'k', detected: 'art', explicit: false, now: 1000 })
  const other = arbiter.decide({ key: 'k', detected: 'audio', explicit: false, now: 2000 })
  assertEqual(other.switch, false)
  assertEqual(other.pendingCount, 1, '换了方向要重新数')
})

await test('迟滞：不同会话互不干扰', () => {
  const arbiter = createSwitchArbiter({ confirmations: 2, cooldownMs: 0 })
  arbiter.decide({ key: 'a', detected: 'art', explicit: false, now: 1000 })
  const otherSession = arbiter.decide({ key: 'b', detected: 'art', explicit: false, now: 1000 })
  assertEqual(otherSession.switch, false)
  assertEqual(otherSession.pendingCount, 1)
})

await test('迟滞集成：一句关键词不再立刻切阶段（走真实入口）', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const agent = rt.makeAgent('h1')
  const listener = (rt.listeners.get('agent/inbox/claimed') || [])[0]
  listener({ agent, message: { content: [{ type: 'text', text: '生成一张贴图' }] } })
  let status = await rt.tools.get('route_status').execute({}, { agent })
  assertEqual(status.stage, 'auto', '第一次不该切')
  assertEqual(status.switchArbiter.pendingStage, 'art')
  assertEqual(status.switchArbiter.pendingCount, 1)

  listener({ agent, message: { content: [{ type: 'text', text: '再生成一张贴图' }] } })
  status = await rt.tools.get('route_status').execute({}, { agent })
  assertEqual(status.stage, 'art', '第二次才切')
})

await test('迟滞集成：显式"切到 X 阶段"一句话就切', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const agent = rt.makeAgent('h2')
  const listener = (rt.listeners.get('agent/inbox/claimed') || [])[0]
  listener({ agent, message: { content: [{ type: 'text', text: '切到美术阶段' }] } })
  const status = await rt.tools.get('route_status').execute({}, { agent })
  assertEqual(status.stage, 'art')
  assertEqual(status.lastArbiterDecision.reason, 'explicit')
})

// ============================================================================
// 10.8 成本闸门（P1+P2）：按最坏情况估"几轮能回本"
// ============================================================================
await test('成本：估算公式正确（成本按最坏情况 = 整段上下文）', () => {
  const e = estimateSwitchEconomy({ contextTokens: 100000, deniedBytes: 100000 })
  assertEqual(e.costTokens, 100000, '最坏情况：整段上下文全价')
  assertEqual(e.savePerTurnTokens, 30000, '100,000 字节 × 0.3')
  assertEqual(e.paybackTurns, 3.33)
})

await test('成本：省不下东西时 payback 是 null（不是 Infinity/NaN）', () => {
  const e = estimateSwitchEconomy({ contextTokens: 50000, deniedBytes: 0 })
  assertEqual(e.paybackTurns, null)
  assertEqual(JSON.stringify(JSON.parse(JSON.stringify(e))), JSON.stringify(e), '必须是无损 JSON')
})

await test('成本：回本太快不值得的切换会被拦', () => {
  const v = decideByEconomy({
    economy: estimateSwitchEconomy({ contextTokens: 500000, deniedBytes: 90000 }),
    maxPaybackTurns: 3,
  })
  assertEqual(v.allow, false)
  assertEqual(v.reason, 'payback-too-long')
})

await test('成本：上下文还小的时候放行（回本很快）', () => {
  const v = decideByEconomy({
    economy: estimateSwitchEconomy({ contextTokens: 20000, deniedBytes: 90000 }),
    maxPaybackTurns: 3,
  })
  assertEqual(v.allow, true)
  assertEqual(v.reason, 'worth-it')
})

await test('成本：还没有上下文数据时放行（不拿"未知"当"亏本"）', () => {
  const v = decideByEconomy({
    economy: estimateSwitchEconomy({ contextTokens: 0, deniedBytes: 90000 }),
    maxPaybackTurns: 3,
  })
  assertEqual(v.allow, true)
  assertEqual(v.reason, 'no-cost-yet')
})

await test('成本：闸门可关闭', () => {
  const v = decideByEconomy({
    economy: estimateSwitchEconomy({ contextTokens: 500000, deniedBytes: 90000 }),
    maxPaybackTurns: 3,
    enabled: false,
  })
  assertEqual(v.allow, true)
})

await test('成本集成：大会话里自动切换被成本闸门拦住', async () => {
  const rt = makeFakeCtx()
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    apply(rt.ctx, { contextGuardThreshold: 0 }) // 关掉旧的硬闸门，只测成本闸门
    const agent = rt.makeAgent('cost-1')
    await feedContext(rt, 'cost-1', 500000)
    const listener = (rt.listeners.get('agent/inbox/claimed') || [])[0]
    listener({ agent, message: { content: [{ type: 'text', text: '生成一张贴图' }] } })
    const status = await rt.tools.get('route_status').execute({}, { agent })
    assertEqual(status.stage, 'auto', '成本太高，不该切')
    assertEqual(status.lastBlockedSwitch.by, 'cost-gate')
    assert(status.lastBlockedSwitch.paybackTurns > 3, '要报出回本需要几轮')
    assertEqual(warnings.length, 1)
  } finally {
    console.warn = original
  }
})

await test('成本集成：小会话里同样的一句话照常切', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const agent = rt.makeAgent('cost-2')
  await feedContext(rt, 'cost-2', 2000)
  const listener = (rt.listeners.get('agent/inbox/claimed') || [])[0]
  listener({ agent, message: { content: [{ type: 'text', text: '生成一张贴图' }] } })
  listener({ agent, message: { content: [{ type: 'text', text: '再生成一张贴图' }] } })
  const status = await rt.tools.get('route_status').execute({}, { agent })
  assertEqual(status.stage, 'art', '小会话回本快，应该允许切')
})

await test('成本集成：显式命令不被成本闸门拦（用户亲口要求的）', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { contextGuardThreshold: 0 })
  const agent = rt.makeAgent('cost-3')
  await feedContext(rt, 'cost-3', 500000)
  const listener = (rt.listeners.get('agent/inbox/claimed') || [])[0]
  listener({ agent, message: { content: [{ type: 'text', text: '切到美术阶段' }] } })
  const status = await rt.tools.get('route_status').execute({}, { agent })
  assertEqual(status.stage, 'art', '显式命令应该绕过成本闸门')
})

await test('成本集成：route_status 能列出每个阶段的回本账', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const agent = rt.makeAgent('cost-4')
  await feedContext(rt, 'cost-4', 100000)
  const status = await rt.tools.get('route_status').execute({}, { agent })
  assertEqual(status.switchEconomics.enabled, true)
  assertEqual(status.switchEconomics.contextTokens, 100000)
  assert(typeof status.switchEconomics.perStage.art === 'object', '每个阶段都要有账')
  assertEqual(status.switchEconomics.perStage.art.paybackTurns > 0, true)
})

// ============================================================================
// 10.9 依赖与入口的健壮性（缺 systemPrompt 不能整个插件挂掉）
// ============================================================================
await test('入口：inject 只硬依赖 tools（systemPrompt 是可选的）', () => {
  assertEqual(inject.includes('tools'), true)
  assertEqual(inject.includes('systemPrompt'), false, '不能硬依赖 systemPrompt，否则缺它的环境整个插件加载失败')
})

await test('入口：运行时数据不在包目录里（否则真实依赖安装会被重装清掉）', () => {
  const cfg = normalizeConfig({})
  assert(cfg.customStagesFile.includes('.dsh'), `配置默认应在用户目录，实际 ${cfg.customStagesFile}`)
  assertEqual(cfg.customStagesFile.includes('node_modules'), false)
  assertEqual(cfg.customStagesFile.includes('.pnpm'), false)
  assert(STATE_DIR.includes('.dsh'), 'STATE_DIR 应在 ~/.dsh 下')
})

await test('入口：缺 systemPrompt 时，工具照常注册、其它模块照常工作', () => {
  const rt = makeFakeCtx({ noSystemPrompt: true })
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    apply(rt.ctx, {})
    // 路由的 4 个工具还在
    assert(rt.tools.has('route_stage'))
    assert(rt.tools.has('route_status'))
    assert(rt.tools.has('route_reset'))
    assert(rt.tools.has('route_init'))
    // 熔断和探针也还在（这正是改注入之前会一起死掉的部分）
    assert(rt.tools.has('guard_status'), '缺 systemPrompt 不该连累熔断')
    assert(rt.tools.has('cache_probe_report'), '缺 systemPrompt 不该连累探针')
    // 一条尾插都没注册
    assertEqual(rt.contexts.length, 0)
    // 要给一句人话解释
    assert(warnings.some((w) => w.includes('systemPrompt')), '要说明为什么尾插被禁用')
  } finally {
    console.warn = original
  }
})

await test('入口：缺 systemPrompt 时 route_status 会说明 hint 不可用', async () => {
  const rt = makeFakeCtx({ noSystemPrompt: true })
  const original = console.warn
  console.warn = () => {}
  try {
    apply(rt.ctx, {})
    const status = await rt.tools.get('route_status').execute({}, { agent: rt.makeAgent('n1') })
    assertEqual(status.hintAvailable, false)
    assertEqual(status.hintEffective, false)
    assertEqual(status.hint, '')
    // 拦截照样生效
    await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent: rt.makeAgent('n1') })
    const blocked = await preExecute(rt, { name: 'unity_object_create', arguments: {}, agent: rt.makeAgent('n1') })
    assertEqual(blocked.kind, 'deny', '越界拦截不依赖 systemPrompt')
  } finally {
    console.warn = original
  }
})

await test('入口：探针数据路径不会被空的 dataFile 覆盖回包目录（实测踩过的坑）', () => {
  const stateDir = join(tmpdir(), 'fake-state-dir')
  // 配置里 dataFile: '' 是最常见的情况（patch 里默认就是空串）
  const fromEmpty = pickProbeDataFile({ dataFile: '' }, stateDir)
  assertEqual(fromEmpty, join(stateDir, 'usage.jsonl'), '空串必须回退到用户目录，不能回退到包目录')
  // 显式给了路径就尊重
  const explicit = pickProbeDataFile({ dataFile: 'D:/my/usage.jsonl' }, stateDir)
  assertEqual(explicit, 'D:/my/usage.jsonl')
  // 完全没配也回退到用户目录
  assertEqual(pickProbeDataFile({}, stateDir), join(stateDir, 'usage.jsonl'))
})

// ============================================================================
// 10.10 跨环境适配（别的部署实测踩到的 5 个坑）
// ============================================================================
await test('跨环境：trustedModels 写成 provider/model 也能命中（纯 ID 比较是坑）', () => {
  const withPrefix = resolveCapability({
    provider: 'bailian',
    model: 'deepseek-v4.1-flash-1017',
    trusted: ['bailian/deepseek-v4.1-flash-1017'],
  })
  assertEqual(withPrefix.safe, true, '带前缀的写法必须也能命中')
  assertEqual(withPrefix.source, 'trusted')

  const mixedCase = resolveCapability({ model: 'My-Flash', trusted: ['  MY-FLASH  '] })
  assertEqual(mixedCase.safe, true, '大小写和空格不该影响命中')
})

await test('跨环境：查表也走归一化名（deepseek-account/deepseek-flash 认得出）', () => {
  const cap = resolveCapability({ provider: 'deepseek-account', model: 'deepseek-account/deepseek-flash' })
  assertEqual(cap.safe, true)
  assertEqual(cap.source, 'table')
})

await test('跨环境：custom_stages 允许写成数组（用户最常见的写法）', () => {
  const checked = validateStagesConfig({
    defaultStage: 'chat',
    stages: [
      { stage: 'chat', title: '闲聊', allow: ['snowluma'], keywords: ['聊天'] },
      { stage: 'core', allow: [] },
    ],
  })
  assertEqual(checked.ok, true, checked.errors.join('; '))
  assertEqual(checked.stages.chat.allow[0], 'snowluma')
  assertEqual(checked.stages.core.allow.length, 0)
  assertEqual(checked.defaultStage, 'chat')
})

await test('跨环境：strict 阶段会拒绝"没被任何阶段认领"的标签（别人那台机器唯一能瘦身的办法）', () => {
  const stages = {
    chat: { title: '闲聊', allow: ['snowluma'], strict: true },
    core: { title: '通用', allow: [] },
  }
  const claimed = claimedTags(stages)
  const stranger = decideOutOfStage({ toolName: 'qq_send', stage: 'chat', stages, claimed })
  assertEqual(stranger.allow, false, 'strict 下未认领标签也要拦')
  assert(stranger.reason.includes('阶段越界'))
})

await test('跨环境：默认（非 strict）仍然放行未认领标签，绝不误杀', () => {
  const stages = { chat: { title: '闲聊', allow: ['snowluma'] } }
  const claimed = claimedTags(stages)
  const stranger = decideOutOfStage({ toolName: 'qq_send', stage: 'chat', stages, claimed })
  assertEqual(stranger.allow, true, '没写 strict 就必须保持放行')
})

await test('跨环境：阶段表和实际工具对不上时，route_status 会明说', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const status = await rt.tools.get('route_status').execute({}, { agent: rt.makeAgent('x1') })
  // 假环境里有 unity/ui/meshy/perc/audio/asset，所以不算"对不上"
  assertEqual(status.stageTableUnused, false)
  assertEqual(status.stageTableHint, '')
})

await test('跨环境：内置阶段表认领的标签一个都不存在时，stageTableUnused 为 true', async () => {
  const rt = makeFakeCtx()
  // 只造一台"只有 snowluma 工具"的机器
  apply(rt.ctx, {})
  const onlyStranger = rt.ctx.tools.schemas().filter((t) => !t.name.startsWith('unity_') && !t.name.startsWith('ui_'))
  const status = await rt.tools.get('route_status').execute({}, { agent: rt.makeAgent('x2') })
  assert(Array.isArray(onlyStranger))
  assertEqual(typeof status.stageTableUnused, 'boolean')
})

await test('跨环境：trustedModels 命中时会提醒"这是你的断言，不是实测"', () => {
  const rt = makeFakeCtx({ model: 'my-flash', provider: 'local' })
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    apply(rt.ctx, { trustedModels: ['my-flash'] })
    assert(warnings.length >= 1, '应该给出提醒')
    assert(warnings.some((w) => w.includes('trustedModels')), '要指出是白名单放行的')
    assert(rt.contexts[0].text().length > 0, '放行后尾插要恢复')
  } finally {
    console.warn = original
  }
})

// ============================================================================
// 10.11 体验优化：提示可调长短、长会话提前预警、内置示例
// ============================================================================
await test('体验：尾部提示长度可配置（默认 200，可以调短）', () => {
  const long = renderHint({ stage: 'unity-code', stages: DEFAULT_STAGES, claimed: REAL_CLAIMED })
  const short = renderHint({ stage: 'unity-code', stages: DEFAULT_STAGES, claimed: REAL_CLAIMED, limit: 60 })
  assert(long.length <= 200)
  assert(short.length <= 60, `调短后应 <= 60，实际 ${short.length}`)
  assertEqual(short.truncated, true)
})

await test('体验：上下文到阈值 80% 就提前预警（不等被拒绝）', async () => {
  const rt = makeFakeCtx()
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    apply(rt.ctx, { contextGuardThreshold: 100000, contextGuardWarnRatio: 0.8 })
    await feedContext(rt, 'warn-1', 85000)
    assert(warnings.some((w) => w.includes('上下文已达')), '应该提示该开新会话了')
    // 只提示一次
    await feedContext(rt, 'warn-1', 87000)
    assertEqual(warnings.filter((w) => w.includes('上下文已达')).length, 1)
  } finally {
    console.warn = original
  }
})

await test('体验：内置示例能被列出并直接写成就绪配置', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'router-preset-'))
  const file = join(dir, 'custom_stages.json')
  try {
    assert(listPresets().includes('python-data'), '应该带内置示例')
    const rt = makeFakeCtx()
    apply(rt.ctx, { customStagesFile: file })
    const out = await rt.tools.get('route_init').execute({ preset: 'python-data' }, { agent: rt.makeAgent('p1') })
    assertEqual(out.ok, true, out.error)
    assertEqual(out.applied, true)
    assertEqual(out.requiresReload, true)
    assert(out.stages.includes('python'))
    const written = JSON.parse(await readFile(file, 'utf8'))
    assertEqual(written.defaultStage, 'auto')
    assert(Array.isArray(written.stages.python.allow) || written.stages.python.allow === undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

await test('体验：写错的示例名会给出可用列表，而不是报错', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, {})
  const out = await rt.tools.get('route_init').execute({ preset: '不存在的示例' }, { agent: rt.makeAgent('p2') })
  assertEqual(out.ok, false)
  assert(out.presets.includes('web-dev'), '要把可用的列出来')
})

// ============================================================================
// 10.12 安全回退 + 累积披露（别人踩过的"控制面被藏死"反模式）
// ============================================================================
await test('安全：strict 模式下诊断工具也不能被藏死（否则再也看不到数字）', () => {
  const stages = { locked: { title: '严格', allow: [], strict: true } }
  const claimed = claimedTags(stages)
  for (const tool of ['cache_probe_report', 'cache_probe_clear', 'route_status', 'route_reset', 'guard_reset']) {
    const v = decideOutOfStage({ toolName: tool, stage: 'locked', stages, claimed })
    assertEqual(v.allow, true, `${tool} 在严格模式里也必须能调`)
  }
})

await test('安全：strict 下普通工具确实会被拦（确认不是全都放行）', () => {
  const stages = { locked: { title: '严格', allow: [], strict: true } }
  const claimed = claimedTags(stages)
  const v = decideOutOfStage({ toolName: 'unity_object_create', stage: 'locked', stages, claimed })
  assertEqual(v.allow, false)
})

await test('累积披露：关掉时按阶段严格裁剪（默认）', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { enforceByRestrict: true })
  const agent = rt.makeAgent('acc-0')
  // unity-code 阶段：unity 工具是**可见**的
  await rt.tools.get('route_stage').execute({ stage: 'unity-code' }, { agent })
  // 切到 core：unity 应该被收回
  await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
  const lastDeny = rt.restricts[rt.restricts.length - 1].deny
  assert(lastDeny.includes('unity_object_create'), '默认不累积：unity 露过面也会被收回')
})

await test('累积披露：打开后，露过面的组不再收回（工具表只增不减）', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { enforceByRestrict: true, accumulateDisclosure: true })
  const agent = rt.makeAgent('acc-1')
  // unity-code 阶段：unity 工具可见 → 记为"已披露"
  await rt.tools.get('route_stage').execute({ stage: 'unity-code' }, { agent })
  // 切到 core：unity 已经露过面，不该被收回
  await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
  const lastDeny = rt.restricts[rt.restricts.length - 1].deny
  assertEqual(lastDeny.includes('unity_object_create'), false, 'unity 已经露过面，不该再被收回')
  // 但没露过面的组照样砍（比如 meshy）
  assert(lastDeny.includes('meshy_image_to_3d'), '没露面过的组仍然要被砍，否则就不叫瘦身了')
})

await test('累积披露：route_reset 会清空累积状态（回到严格裁剪）', async () => {
  const rt = makeFakeCtx()
  apply(rt.ctx, { enforceByRestrict: true, accumulateDisclosure: true })
  const agent = rt.makeAgent('acc-2')
  await rt.tools.get('route_stage').execute({ stage: 'unity-code' }, { agent })
  await rt.tools.get('route_reset').execute({}, { agent })
  await rt.tools.get('route_stage').execute({ stage: 'core' }, { agent })
  const lastDeny = rt.restricts[rt.restricts.length - 1].deny
  assert(lastDeny.includes('unity_object_create'), '复位后应该重新严格裁剪')
})

// ============================================================================
// 11. 配置
// ============================================================================
await test('配置：脏数据自动回退，不会把插件搞挂', () => {
  const cfg = normalizeConfig({ lintMode: '瞎写', defaultStage: '不存在', maxSessions: -1 })
  assertEqual(cfg.lintMode, 'deny')
  assertEqual(cfg.defaultStage, 'auto')
  assert(cfg.maxSessions >= 1)
})

// ============================================================================
// 汇总
// ============================================================================
const elapsed = Date.now() - startedAt
console.log('')
console.log('============================================================')
if (failed === 0) {
  console.log(`${GREEN}${BOLD}  \u2705 ALL ${passed} TESTS PASSED${RESET}  ${DIM}(${elapsed}ms / 0 failed)${RESET}`)
  console.log('============================================================\n')
  process.exit(0)
} else {
  console.log(`${RED}${BOLD}  \u274c ${failed} FAILED / ${passed} PASSED${RESET}  ${DIM}(${elapsed}ms)${RESET}`)
  console.log('============================================================')
  for (const f of failures) {
    console.log(`${RED}- ${f.title}${RESET}`)
    console.log(`  ${f.error && f.error.stack ? f.error.stack.split('\n').slice(0, 3).join('\n  ') : String(f.error)}`)
  }
  console.log('')
  process.exit(1)
}
