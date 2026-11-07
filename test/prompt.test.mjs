/**
 * ============================================================================
 * test/prompt.test.mjs —— 尾部提示的两种模式
 * ============================================================================
 * 自动模式（AI 自己决定工具表）是 2026-11-08 加的：
 *   manual = 你手选组；auto = 提示词改成"你来决定"，模型才会主动 route_use/task_start。
 * 这里钉死两件事：文案确实不同、两版都不超过 200 字硬上限。
 * ============================================================================
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { renderHint, HINT_LIMIT } from '../lib/prompt.js'

const BASE = { stage: 'auto', stages: {}, claimed: new Set(), catalog: { tags: {}, total: 239 } }

test('manual 模式：提示指向 route_stage，且不超过上限', () => {
  const r = renderHint({ ...BASE, autoMode: false })
  assert.equal(r.truncated, false)
  assert.ok(r.length <= HINT_LIMIT, `长度 ${r.length} 超了 ${HINT_LIMIT}`)
  assert.ok(r.text.includes('route_stage'), '手动模式应该引导用 route_stage')
  assert.ok(!r.text.includes('YOU decide'), '手动模式不该说"你来决定"')
})

test('auto 模式：提示改成"你来决定"，并指向 route_use / task_start', () => {
  const r = renderHint({ ...BASE, autoMode: true })
  assert.equal(r.truncated, false)
  assert.ok(r.length <= HINT_LIMIT, `长度 ${r.length} 超了 ${HINT_LIMIT}`)
  assert.ok(r.text.includes('YOU decide'), '必须明确把决定权交给模型')
  assert.ok(r.text.includes('route_use'), '要告诉模型用哪个工具收窄')
  assert.ok(r.text.includes('task_start'), '长任务也要给出口')
})

test('两版提示都是纯文本、无换行（尾部提示必须单行）', () => {
  for (const autoMode of [false, true]) {
    const r = renderHint({ ...BASE, autoMode })
    assert.equal(r.text.includes('\n'), false)
  }
})

test('阶段不是 auto 时，模式不影响提示（仍然给允许组 + 逃生动作）', () => {
  const stages = { 'unity-ui': { allow: ['unity', 'ui'] } }
  const manual = renderHint({ stage: 'unity-ui', stages, claimed: new Set(['unity']), catalog: { tags: {}, total: 10 }, autoMode: false })
  const auto = renderHint({ stage: 'unity-ui', stages, claimed: new Set(['unity']), catalog: { tags: {}, total: 10 }, autoMode: true })
  assert.equal(manual.text, auto.text, '已定阶段时两模式应一致')
  assert.ok(manual.text.includes('unity,ui'))
})
