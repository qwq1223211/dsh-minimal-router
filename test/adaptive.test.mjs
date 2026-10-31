/**
 * 自适应阶段（lib/adaptive.js）的测试。
 *
 * 这个模块会**自动切阶段**，所以测试重点全在"什么时候必须不切"：
 *   - 样本不够（少于 minCalls）→ 不切
 *   - 占比不够（低于 minShare）→ 不切
 *   - 只有基础工具（core）→ 不切（core 哪个阶段都在，不构成信号）
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createSignalWindow } from '../lib/adaptive.js'

test('连续调用同一组 → 判定为占多数', () => {
  const w = createSignalWindow({ size: 20 })
  for (let i = 0; i < 7; i += 1) w.push('unity')
  const d = w.dominant({ minCalls: 6, minShare: 0.6 })
  assert.ok(d)
  assert.equal(d.tag, 'unity')
  assert.equal(d.calls, 7)
})

test('样本不足 → 不判定', () => {
  const w = createSignalWindow()
  for (let i = 0; i < 4; i += 1) w.push('unity')
  assert.equal(w.dominant({ minCalls: 6, minShare: 0.6 }), null)
})

test('占比不足 → 不判定（两个组来回切）', () => {
  const w = createSignalWindow()
  for (let i = 0; i < 6; i += 1) {
    w.push('unity')
    w.push('art')
  }
  assert.equal(w.dominant({ minCalls: 6, minShare: 0.6 }), null)
})

test('core 不构成信号', () => {
  const w = createSignalWindow()
  for (let i = 0; i < 10; i += 1) w.push('core')
  assert.deepEqual(w.snapshot(), [])
  assert.equal(w.dominant({ minCalls: 6 }), null)
})

test('窗口滑动：老信号会被挤出去', () => {
  const w = createSignalWindow({ size: 8 })
  for (let i = 0; i < 8; i += 1) w.push('unity')
  for (let i = 0; i < 8; i += 1) w.push('art')
  const d = w.dominant({ minCalls: 6, minShare: 0.6 })
  assert.equal(d.tag, 'art') // unity 已经被挤干净
  assert.equal(w.snapshot().every((t) => t === 'art'), true)
})

test('干净输入处理：空串 / 非字符串 / 大写', () => {
  const w = createSignalWindow()
  w.push('')
  w.push(null)
  w.push('UNITY')
  assert.deepEqual(w.snapshot(), ['unity'])
})

test('reset 清空窗口', () => {
  const w = createSignalWindow()
  w.push('unity')
  w.reset()
  assert.deepEqual(w.snapshot(), [])
})
