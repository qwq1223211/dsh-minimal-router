/**
 * 反馈模块（lib/feedback.js）的测试。
 *
 * 它只影响"提示文案"和"诊断数字"，不碰工具表；
 * 但"建议"如果永不过期，会变成每轮都在的噪音，所以过期行为必须测。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createFeedback } from '../lib/feedback.js'

test('建议：设置后能读回', () => {
  const f = createFeedback()
  f.setSuggestion('s1', { stage: 'art', tag: 'art', score: 1.2 })
  const s = f.getSuggestion('s1')
  assert.equal(s.stage, 'art')
  assert.equal(s.tag, 'art')
})

test('建议：过期自动消失（默认 5 分钟）', () => {
  let t = 0
  const f = createFeedback({ now: () => t })
  f.setSuggestion('s1', { stage: 'art', tag: 'art' })
  t = 4 * 60 * 1000
  assert.ok(f.getSuggestion('s1'))
  t = 6 * 60 * 1000
  assert.equal(f.getSuggestion('s1'), null)
})

test('建议：缺字段不接受（避免生成半截提示）', () => {
  const f = createFeedback()
  f.setSuggestion('s1', { stage: 'art' }) // 没有 tag
  assert.equal(f.getSuggestion('s1'), null)
})

test('拦截回收：拦一次、换路一次 → 100%', () => {
  const f = createFeedback()
  f.noteDeny('s1')
  f.noteRecover('s1')
  const s = f.summary('s1')
  assert.equal(s.denied, 1)
  assert.equal(s.recovered, 1)
  assert.equal(s.rate, 1)
})

test('拦截回收：超过 2 分钟换路不算恢复', () => {
  let t = 0
  const f = createFeedback({ now: () => t })
  f.noteDeny('s1')
  t = 3 * 60 * 1000
  f.noteRecover('s1')
  assert.equal(f.summary('s1').recovered, 0)
})

test('拦截回收：没有拦截记录时给出中性结论', () => {
  const f = createFeedback()
  const s = f.summary('nobody')
  assert.equal(s.denied, 0)
  assert.equal(s.rate, null)
  assert.match(s.note, /还没拦过/)
})

test('拦截回收：恢复率低时提示"文案可能需要更具体"', () => {
  const f = createFeedback()
  for (let i = 0; i < 4; i += 1) f.noteDeny('s1')
  f.noteRecover('s1')
  const s = f.summary('s1')
  assert.equal(s.rate, 0.25)
  assert.match(s.note, /经常放弃/)
})
