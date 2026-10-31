/**
 * ============================================================================
 * test/infra.test.mjs · 个人基建的三条底线
 * ============================================================================
 * 1. 未认领即放行：未来装的第三方插件，工具绝不能被误杀（这条最重要）
 * 2. 探针只量体积，不做跨插件归因（不越权）
 * 3. 并集默认关闭；未认领标签要能看到体积
 * ============================================================================
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decideOutOfStage, computeDenyList, tagBytesOf, claimedTags } from '../lib/classify.js'
import { findUnclaimed } from '../lib/stages-config.js'
import { DEFAULT_STAGES, STAGE_ORDER } from '../lib/stages-default.js'
import { detectStage } from '../lib/stage.js'
import { setUnionEnabled, unionEnabled, synthesizeStage, withUnion } from '../lib/union.js'
import { buildProfiles, scoreText } from '../lib/intent.js'
import { makeRecord } from '../lib/probe-core.js'

const CLAIMED = claimedTags(DEFAULT_STAGES)
/** 模拟"未来某个第三方插件"的标签：它的名字不在任何阶段的 allow 里 */
const FUTURE = 'futureplug_do_something'

// ---------------------------------------------------------------------------
// 一、未认领即放行（基建底线）
// ---------------------------------------------------------------------------

test('未认领标签：任何阶段都不得拒绝（含 core / unity-code / 并集）', () => {
  for (const stage of ['core', 'unity-code', 'unity-ui', 'art', 'audio', 'python-code', 'document-write']) {
    const verdict = decideOutOfStage({ toolName: FUTURE, stage, stages: DEFAULT_STAGES, claimed: CLAIMED })
    assert.equal(verdict.allow, true, `${stage} 阶段误杀了未认领工具`)
  }
})

test('未认领标签：即使开启并集也不得被拒绝', () => {
  setUnionEnabled(true)
  try {
    const verdict = decideOutOfStage({
      toolName: FUTURE,
      stage: 'python-code+document-write',
      stages: DEFAULT_STAGES,
      claimed: CLAIMED,
    })
    assert.equal(verdict.allow, true, '并集阶段也误杀了未认领工具')
  } finally {
    setUnionEnabled(false)
  }
})

test('未认领标签：永远不出现在 deny 列表里（真实收窄时的裁剪依据）', () => {
  const toolNames = ['read', 'write', FUTURE, 'unity_object_create', 'futureplug_other']
  for (const stage of ['core', 'unity-code', 'document-write']) {
    const deny = computeDenyList({ toolNames, stage, stages: DEFAULT_STAGES, claimed: CLAIMED, coreTools: [] })
    assert.equal(deny.includes(FUTURE), false, `${stage} 把未认领工具算进了 deny`)
    assert.equal(deny.includes('futureplug_other'), false, `${stage} 把未认领工具算进了 deny`)
  }
  // 反证：被认领的 unity 工具确实会被摘（说明不是"什么都不摘"）
  const denyCore = computeDenyList({ toolNames, stage: 'core', stages: DEFAULT_STAGES, claimed: CLAIMED, coreTools: [] })
  assert.ok(denyCore.includes('unity_object_create'), 'unity 是被认领的，应该被摘')
})

test('唯一例外是阶段显式 strict:true（这是有意的选择，不是默认）', () => {
  const strictStages = {
    ...DEFAULT_STAGES,
    strictstage: { title: '严格', allow: ['unity'], keywords: [], strict: true },
  }
  const verdict = decideOutOfStage({
    toolName: FUTURE,
    stage: 'strictstage',
    stages: strictStages,
    claimed: new Set(['unity']),
  })
  assert.equal(verdict.allow, false, 'strict:true 时未认领也会被拒绝（唯一例外）')
})

// ---------------------------------------------------------------------------
// 二、探针边界：只量体积，不追责插件
// ---------------------------------------------------------------------------

test('探针记录不含任何"哪个插件改了什么"的归因字段', () => {
  const record = makeRecord(
    { messages: 3, tools: ['a', 'b'], toolsChars: 100, systemChars: 200, systemMessages: 1, prefixSig: 's1' },
    { inputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, promptTokens: 10, outputTokens: 1 },
    Date.now(),
    {},
  )
  const banned = ['plugin', 'attribution', 'source', 'changedBy', 'owner']
  for (const key of banned) {
    assert.equal(Object.hasOwn(record, key), false, `探针不该记录 ${key}（越权）`)
  }
  // 该记的还在
  for (const key of ['toolsChars', 'systemChars', 'prefixSig', 'promptTokens']) {
    assert.ok(Object.hasOwn(record, key), `探针应该记录 ${key}`)
  }
})

// ---------------------------------------------------------------------------
// 三、体积归因 + 并集默认关闭
// ---------------------------------------------------------------------------

test('tagBytesOf：按标签累加字节，且和工具数无关', () => {
  const schemas = [
    { name: 'unity_object_create', description: 'x'.repeat(100), parameters: {} },
    { name: 'unity_object_delete', description: 'y'.repeat(200), parameters: {} },
    { name: 'read', description: 'z'.repeat(10), parameters: {} },
  ]
  const bytes = tagBytesOf(schemas, [])
  assert.ok(bytes.unity > bytes.core, 'unity 两个大工具应该比 core 大')
  assert.ok(bytes.unity > 300)
})

test('findUnclaimed：带字节数，且按体积降序；没有数据时填 0 不填 undefined', () => {
  const tags = { futureplug: 2, other: 1, unity: 5 }
  const bytes = { futureplug: 9000, other: 100 }
  const list = findUnclaimed({ tagCounts: tags, claimed: new Set(['unity']), tagBytes: bytes })
  assert.equal(list.length, 2, 'unity 被认领，不该出现在未认领列表')
  assert.equal(list[0].tag, 'futureplug')
  assert.equal(list[0].bytes, 9000)
  assert.equal(list[1].bytes, 100)
  // 没给 tagBytes 时必须是 0，不能是 undefined
  const noBytes = findUnclaimed({ tagCounts: tags, claimed: new Set(['unity']) })
  for (const item of noBytes) {
    assert.equal(typeof item.bytes, 'number')
    assert.equal(item.bytes, 0)
  }
})

test('并集默认关闭：跨领域句只给一个阶段，且永远不含 "+"', () => {
  setUnionEnabled(false)
  assert.equal(unionEnabled(), false)
  const stage = detectStage('帮我写个 Python 脚本爬取网页，然后整理成一份周报文档', DEFAULT_STAGES, STAGE_ORDER)
  assert.ok(stage, '应该能判出一个阶段')
  assert.equal(stage.includes('+'), false, `默认关闭时不该出现并集，实际：${stage}`)
})

// ---------------------------------------------------------------------------
// 四、v1.19.3 加固：关闭态 / strict 不继承 / 探针白名单
// ---------------------------------------------------------------------------

test('模块默认关闭：用全新模块实例断言，不依赖测试执行顺序', async () => {
  // 为什么不用 unionEnabled()：本文件后面的用例会 setUnionEnabled(true)，
  // 那条断言就变成了"看顺序吃饭"。这里用 query 后缀拿一个全新实例，
  // 它只可能是初始状态（默认关闭）。
  const fresh = await import(`../lib/union.js?fresh=${Date.now()}`)
  assert.equal(fresh.unionEnabled(), false)
})

test('scoreText：等高夹具 —— 关闭态走"放弃"，开启态才给两个阶段', () => {
  // 两个画像关键词完全相同 → 分数相等 → margin 0。
  // 这个夹具对权重调整不敏感（只要两边对称），所以它是主断言。
  const twin = buildProfiles({
    gamma: { title: 'G', allow: ['g'], keywords: ['文档', '整理', '周报'] },
    delta: { title: 'D', allow: ['d'], keywords: ['文档', '整理', '周报'] },
  })
  const sentence = '帮我整理一份周报文档'

  setUnionEnabled(false)
  try {
    assert.equal(scoreText(sentence, twin), null, '关闭态：两阶段同分 → 必须放弃（不走并集）')
  } finally {
    setUnionEnabled(true)
  }

  const on = scoreText(sentence, twin)
  assert.ok(on, '开启态应该给出判定')
  assert.equal(on.stages.length, 2, '开启态：等高 → 两个阶段')

  setUnionEnabled(false)
})

test('scoreText：margin 足够时关闭态仍给单阶段（回归样例，分数漂移需重采样）', () => {
  const profiles = buildProfiles({
    'alpha-stage': { title: 'Alpha', allow: ['alpha'], keywords: ['写脚本', 'python', '爬虫'] },
    'beta-stage': { title: 'Beta', allow: ['beta'], keywords: ['周报', '文档', '整理'] },
  })
  const sentence = '帮我写个 Python 脚本爬取网页，然后整理成一份周报文档'

  setUnionEnabled(false)
  // 实测：score 21.793 / second 14.075 / margin 0.354（≥ minMargin 0.25）
  // 【注意】这里保护的是"margin 足够时不走 null 路径"这个行为，不是保护具体数值；
  // 若调整了 scoreText 的权重或阈值，请重新采样并在注释里更新这三个数。
  const off = scoreText(sentence, profiles)
  assert.ok(off, 'margin 足够时不该放弃')
  assert.equal(off.stages.length, 1, '关闭态只能给单阶段')
  assert.equal(off.stage, 'beta-stage')

  setUnionEnabled(true)
  const on = scoreText(sentence, profiles)
  assert.equal(on.stages.length, 2, '开启态应给出并集')
  setUnionEnabled(false)
})

test('detectStage：同一句在两种模式下的对照', () => {
  const sentence = '帮我写个 Python 脚本爬取网页，然后整理成一份周报文档'

  setUnionEnabled(false)
  assert.equal(detectStage(sentence, DEFAULT_STAGES, STAGE_ORDER), 'python-code', '关闭态：首个命中即返回')

  setUnionEnabled(true)
  try {
    assert.equal(
      detectStage(sentence, DEFAULT_STAGES, STAGE_ORDER),
      'document-write+python-code',
      '开启态：多命中时委托打分器，给出并集',
    )
  } finally {
    setUnionEnabled(false)
  }
})

test('strict 不被并集继承：合成阶段本身没有 strict 字段', () => {
  const def = synthesizeStage('python-code+document-write', DEFAULT_STAGES)
  assert.ok(def, '应该能合成并集阶段')
  assert.equal(Object.hasOwn(def, 'strict'), false, '合成阶段不该携带 strict')
})

test('strict 不被并集继承：子阶段标了 strict 也不会外溢到并集', () => {
  // 【注意】必须用 withUnion 包一层：普通展开会丢掉 Proxy，
  // 那样 stages['a+b'] 是 undefined，测试会因为"未知阶段放行"而假绿。
  const strictTable = withUnion({
    ...DEFAULT_STAGES,
    'document-write': { ...DEFAULT_STAGES['document-write'], strict: true },
  })
  const verdict = decideOutOfStage({
    toolName: FUTURE,
    stage: 'python-code+document-write',
    stages: strictTable,
    claimed: CLAIMED,
  })
  assert.equal(verdict.allow, true, '子阶段的 strict 不该外溢到并集，未认领工具必须放行')
})

// 探针记录的**完整**键白名单（实测：20 个键，无条件下字段）。
// 短键含义：v=记录格式版本；at=毫秒时间戳；iso=ISO 字符串。
// 【这条测试是有意严格的】以后谁往探针记录里加字段（尤其"是哪个插件改了什么"这类归因字段），
// 这里会立刻红。修绿的正确步骤：确认新字段不越权 → 更新本白名单 → 更新 docs/LIMITS.md §5。
const RECORD_WHITELIST = [
  'v',
  'at',
  'iso',
  'provider',
  'model',
  'purpose',
  'session',
  'stage',
  'messages',
  'tools',
  'systemChars',
  'systemMessages',
  'toolsChars',
  'prefixSig',
  'inputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'promptTokens',
  'outputTokens',
  'hitRate',
]

test('探针记录：键集合与白名单完全一致（新增字段必须同步文档）', () => {
  const record = makeRecord(
    { messages: 2, tools: 3, toolsChars: 10, systemChars: 20, systemMessages: 1, prefixSig: 'sig' },
    { inputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 0, outputTokens: 3 },
    Date.now(),
    {},
  )
  assert.deepEqual(
    Object.keys(record).sort(),
    [...RECORD_WHITELIST].sort(),
    '探针记录的键集合变了：请先确认新字段不越权（不追责插件），再同步白名单与 docs/LIMITS.md',
  )
})
