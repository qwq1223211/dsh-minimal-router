/**
 * ============================================================================
 * test/live.test.mjs · 运行时可观测性的三个新零件
 * ============================================================================
 *   1. lib/live.js      —— 会话 → 阶段（让探针能给每条请求标注阶段）
 *   2. matchedKeyword   —— 记下"到底是哪个词触发的切换"
 *   3. probe-store 轮转 —— 当前文件不够时去读 usage.jsonl.1
 * ============================================================================
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { noteStage, stageOfHash, stageOfKey, hashOf, liveSize } from '../lib/live.js'
import { matchedKeyword } from '../lib/stage.js'
import { DEFAULT_STAGES } from '../lib/stages-default.js'
import { createStore } from '../lib/probe-store.js'

test('hashOf：稳定、空值给空串、不同会话不同哈希', () => {
  assert.equal(hashOf('session-a'), hashOf('session-a'), '同一输入必须稳定')
  assert.notEqual(hashOf('session-a'), hashOf('session-b'))
  assert.equal(hashOf(''), '')
  assert.equal(hashOf(null), '')
})

test('live：记阶段后，按哈希和按原始 id 都能查到', () => {
  noteStage('session-x', 'unity-ui')
  assert.equal(stageOfHash(hashOf('session-x')), 'unity-ui')
  assert.equal(stageOfKey('session-x'), 'unity-ui')
})

test('live：没记录过的会话返回空串（不是 undefined）', () => {
  assert.equal(stageOfHash('never-seen'), '')
  assert.equal(stageOfKey('never-seen'), '')
})

test('live：空阶段名被忽略，不会把已有状态抹成空', () => {
  noteStage('session-y', 'art')
  noteStage('session-y', '')
  assert.equal(stageOfKey('session-y'), 'art')
})

test('live：条目数有上限意识（不会无限增长到不可控）', () => {
  for (let i = 0; i < 260; i += 1) noteStage(`bulk-${i}`, 'core')
  assert.ok(liveSize() <= 200, `应该被裁剪到 200 以内，实际 ${liveSize()}`)
})

test('matchedKeyword：能指出是哪个词触发的', () => {
  assert.equal(matchedKeyword('帮我做个贴图', 'art', DEFAULT_STAGES), '贴图')
  assert.equal(matchedKeyword('调一下界面', 'unity-ui', DEFAULT_STAGES), '界面')
  assert.equal(matchedKeyword('你好啊', 'art', DEFAULT_STAGES), '', '没命中给空串')
  assert.equal(matchedKeyword('x', '不存在的阶段', DEFAULT_STAGES), '')
})

test('art 关键词不再包含裸词 model（开发语境高频，会误切）', () => {
  const words = DEFAULT_STAGES.art.keywords
  assert.equal(words.includes('model'), false, '裸词 model 已移除')
  assert.equal(words.includes('模型'), true, '中文"模型"保留')
})

test('probe-store：当前文件不够时，自动读轮转文件 .1', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'probe-'))
  const file = join(dir, 'usage.jsonl')
  try {
    writeFileSync(`${file}.1`, '{"at":1,"iso":"a"}\n{"at":2,"iso":"b"}\n', 'utf8')
    writeFileSync(file, '{"at":3,"iso":"c"}\n', 'utf8')
    const store = createStore({ file })
    const last3 = await store.read(3)
    assert.equal(last3.length, 3, '应该把 .1 里的两条也读出来')
    assert.deepEqual(last3.map((r) => r.iso), ['a', 'b', 'c'], '顺序必须是旧→新')
    assert.equal(await store.count(), 3, 'count 也要算上轮转文件')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('probe-store：没有轮转文件时行为不变', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'probe2-'))
  const file = join(dir, 'usage.jsonl')
  try {
    writeFileSync(file, '{"at":1}\n', 'utf8')
    const store = createStore({ file })
    assert.equal((await store.read(5)).length, 1)
    assert.equal(await store.count(), 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
