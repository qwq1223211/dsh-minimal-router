/**
 * ============================================================================
 * test/union.test.mjs · 多领域并集
 * ============================================================================
 * 场景刻意不用 Unity —— 路由是通用插件，验证必须跨领域。
 *
 * 目标句：
 *   "帮我写个 Python 脚本爬取网页，然后整理成一份周报文档"
 *   → 同时认出 python-code 和 document-write，两套工具组一起放开
 * ============================================================================
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_STAGES, STAGE_ORDER } from '../lib/stages-default.js'
import { createIntentDetector, scoreText, buildProfiles } from '../lib/intent.js'
import { parseUnion, unionName, synthesizeStage, withUnion } from '../lib/union.js'
import { renderHint, HINT_LIMIT } from '../lib/prompt.js'
import { claimedTags } from '../lib/classify.js'

const CROSS = '帮我写个 Python 脚本爬取网页，然后整理成一份周报文档'
const detector = createIntentDetector(DEFAULT_STAGES, {})

// ---------------------------------------------------------------------------
// 一、纯函数：并集名的解析与合成
// ---------------------------------------------------------------------------

test('parseUnion：只认 "a+b" 形态', () => {
  assert.deepEqual(parseUnion('python-code+document-write'), ['python-code', 'document-write'])
  assert.equal(parseUnion('python-code'), null, '没有分隔符就不是并集')
  assert.equal(parseUnion(''), null)
  assert.equal(parseUnion(null), null)
})

test('unionName：拼接回字符串', () => {
  assert.equal(unionName(['a', 'b']), 'a+b')
  assert.equal(unionName([]), '')
})

test('synthesizeStage：allow 是两边去重后的并集', () => {
  const def = synthesizeStage('python-code+document-write', DEFAULT_STAGES)
  assert.ok(def, '应该能合成')
  assert.equal(def.synthetic, true)
  assert.deepEqual(def.parts, ['python-code', 'document-write'])
  for (const tag of ['python', 'terminal', 'office', 'study']) {
    assert.ok(def.allow.includes(tag), `${tag} 应该在并集里`)
  }
  // 去重：两边不重复
  assert.equal(new Set(def.allow).size, def.allow.length)
  // 合成阶段不参与关键词匹配
  assert.deepEqual(def.keywords, [])
})

test('synthesizeStage：只有一个有效部分时退回那个真实阶段', () => {
  const def = synthesizeStage('python-code+不存在的阶段', DEFAULT_STAGES)
  assert.equal(def, DEFAULT_STAGES['python-code'], '不该造等价替身')
  assert.equal(synthesizeStage('nope+nada', DEFAULT_STAGES), undefined)
})

test('withUnion：Object.keys 不含合成名，但下标能取到', () => {
  const keys = Object.keys(DEFAULT_STAGES)
  assert.equal(keys.some((k) => k.includes('+')), false, '合成名不能漏进阶段列表')
  assert.ok(keys.includes('python-code') && keys.includes('document-write'))
  assert.ok(DEFAULT_STAGES['python-code+document-write'], '下标必须能解析')
  assert.equal('python-code+document-write' in DEFAULT_STAGES, true, 'in 也要认')
})

test('withUnion：合成结果有缓存（引用稳定）', () => {
  const a = DEFAULT_STAGES['python-code+document-write']
  const b = DEFAULT_STAGES['python-code+document-write']
  assert.equal(a, b, '每次访问都造新对象会导致无谓的重新计算')
})

// ---------------------------------------------------------------------------
// 二、判定器：跨领域句必须给出并集
// ---------------------------------------------------------------------------

test('判定器：跨领域句 → 同时认出 python-code 与 document-write', () => {
  const guess = detector(CROSS)
  assert.ok(guess, '这句必须被判出来')
  assert.deepEqual([...guess.stages].sort(), ['document-write', 'python-code'])
  assert.equal(guess.reason, 'union-strong-second', '理由要能解释为什么取并集')
  assert.equal(guess.stage, unionName(guess.stages), 'stage 必须是并集字符串')
  assert.deepEqual(parseUnion(guess.stage).sort(), ['document-write', 'python-code'])
})

test('判定器：并集里两个阶段的分数都够强（不是靠压低阈值骗出来的）', () => {
  const guess = detector(CROSS)
  assert.ok(guess.secondScore >= 2.4 * 0.8, `第二名 ${guess.secondScore} 必须自己有分量`)
})

test('判定器：单领域句仍然只给一个（不回归）', () => {
  const a = detector('写个 python 脚本')
  assert.equal(a.stage, 'python-code')
  assert.equal(a.stages.length, 1)

  const b = detector('帮我整理一份周报文档')
  assert.equal(b.stage, 'document-write')
  assert.equal(b.stages.length, 1)
})

test('判定器：Unity 场景没有回归（unity-ui 仍优先于 unity-code）', () => {
  const guess = detector('做个 Unity UI 设置界面')
  assert.equal(guess.stage, 'unity-ui')
  assert.equal(guess.stages.length, 1, '同一族的两阶段不该被并集成一个更宽的网')
})

test('判定器：无关句仍然返回 null（宁可不切）', () => {
  assert.equal(detector('今天天气不错'), null)
  assert.equal(detector('帮我搞一下'), null)
})

test('判定器：并集方向跟分数一致，且固定上限 2 个', () => {
  const guess = detector(CROSS)
  assert.equal(guess.stages.length, 2, '最多两个，三个说明这句太杂')
  assert.ok(guess.score >= guess.secondScore, '第一个是分数更高的那个')
})

// ---------------------------------------------------------------------------
// 三、端到端：并集阶段能被路由用起来
// ---------------------------------------------------------------------------

test('并集阶段能生成提示且不超 200 字', () => {
  const stage = 'python-code+document-write'
  const hint = renderHint({ stage, stages: DEFAULT_STAGES, claimed: claimedTags(DEFAULT_STAGES) })
  assert.ok(hint.length <= HINT_LIMIT, `提示 ${hint.length} 字超上限`)
  assert.ok(hint.text.includes('python-code+document-write') || hint.text.includes('python-code'), '提示里要能看到并集')
})

test('并集阶段能被真实阶段表识别（不是只存在于测试里）', () => {
  for (const stage of Object.keys(DEFAULT_STAGES)) {
    if (stage === 'auto') continue
    const def = DEFAULT_STAGES[stage]
    assert.ok(Array.isArray(def.allow), `${stage} 必须有 allow`)
    assert.ok(Array.isArray(def.keywords), `${stage} 必须有 keywords`)
  }
  // 新加的两个阶段必须在匹配顺序里，否则关键词路径永远轮不到它们
  assert.ok(STAGE_ORDER.includes('python-code'))
  assert.ok(STAGE_ORDER.includes('document-write'))
})

test('scoreText：手工构造画像也能走并集分支', () => {
  const profiles = buildProfiles({
    'alpha-stage': { title: 'Alpha', allow: ['alpha'], keywords: ['写脚本', 'python', '爬虫'] },
    'beta-stage': { title: 'Beta', allow: ['beta'], keywords: ['周报', '文档', '整理'] },
    'noise-stage': { title: 'Noise', allow: ['noise'], keywords: ['天气'] },
  })
  const result = scoreText(CROSS, profiles)
  assert.ok(result, '应该能判出来')
  assert.deepEqual([...result.stages].sort(), ['alpha-stage', 'beta-stage'])
})

// ---------------------------------------------------------------------------
// 四、端到端：并集名字真的能让两边的工具都放行
// ---------------------------------------------------------------------------

test('状态机接受并集名（不会被当成未知阶段拒掉）', async () => {
  const { createStageState } = await import('../lib/stage.js')
  const state = createStageState({ stages: DEFAULT_STAGES, defaultStage: 'auto', order: STAGE_ORDER })
  const key = 'union-session'
  const result = state.setStage(key, 'python-code+document-write')
  assert.notEqual(result.ok, false, `setStage 不该拒绝并集名，实际：${JSON.stringify(result)}`)
  assert.equal(state.get(key).stage, 'python-code+document-write')
})

test('越界判定：并集里两边的工具都放行，第三方的仍然拦', async () => {
  const { decideOutOfStage } = await import('../lib/classify.js')
  const stage = 'python-code+document-write'

  // 并集允许的标签（python 侧：terminal；文档侧：office/study）
  for (const toolName of ['terminal_spawn', 'office_docx_create', 'study_flashcard_add']) {
    const verdict = decideOutOfStage({ toolName, stage, stages: DEFAULT_STAGES })
    assert.equal(verdict.allow, true, `${toolName} 应该被放行`)
  }

  // 不在并集里的（Unity）应该被拦
  const blocked = decideOutOfStage({ toolName: 'unity_object_create', stage, stages: DEFAULT_STAGES })
  assert.equal(blocked.allow, false, 'unity 工具不在并集里，必须被拦')
  assert.ok(blocked.reason.includes('route_stage'), '拦截信息要告诉模型怎么切')
})
