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
import { setUnionEnabled, unionEnabled } from '../lib/union.js'
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
