/**
 * 空转工具画像（lib/usage.js）的测试。
 *
 * 重点不是"数得准"，而是三条安全性质：
 *   1. 文件坏了 / 不存在 → 从零开始，绝不抛
 *   2. 写盘失败 → 只影响统计，不影响主流程
 *   3. 没注册的工具也记录（否则用户卸载后重装会丢历史）
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUsageTracker } from '../lib/usage.js'

const tagOf = (n) => (n.startsWith('unity_') ? 'unity' : n.startsWith('meshy_') ? 'meshy' : 'core')

function tmpFile() {
  const dir = mkdtempSync(join(tmpdir(), 'router-usage-'))
  return { file: join(dir, 'tool-usage.json'), dir }
}

test('记录调用 → 画像能算出未使用数量', () => {
  const { file, dir } = tmpFile()
  try {
    const u = createUsageTracker({ file, flushMs: 0 })
    u.record('read')
    u.record('read')
    u.record('unity_object_create')

    const s = u.summarize(['read', 'write', 'unity_object_create', 'unity_lighting'], tagOf)
    assert.equal(s.registeredTools, 4)
    assert.equal(s.unusedTools, 2) // write + unity_lighting
    assert.equal(s.unusedRatio, 0.5)
    const unityRow = s.unusedGroups.find((g) => g.tag === 'unity')
    assert.equal(unityRow.unused, 1)
    assert.equal(unityRow.total, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('全部用过 → 未使用为 0，给的是正面结论', () => {
  const { file, dir } = tmpFile()
  try {
    const u = createUsageTracker({ file, flushMs: 0 })
    u.record('read')
    u.record('write')
    const s = u.summarize(['read', 'write'], tagOf)
    assert.equal(s.unusedTools, 0)
    assert.match(s.advice, /都至少被调用过/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('落盘后重新载入，计数不丢', () => {
  const { file, dir } = tmpFile()
  try {
    const a = createUsageTracker({ file, flushMs: 0 })
    a.record('read')
    a.record('read')
    a.record('grep')

    const b = createUsageTracker({ file, flushMs: 0 })
    const top = b.summarize(['read', 'grep'], tagOf).topUsed
    assert.equal(top[0].name, 'read')
    assert.equal(top[0].calls, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('文件损坏 → 从零开始，不抛', () => {
  const { file, dir } = tmpFile()
  try {
    writeFileSync(file, '{ this is not json', 'utf8')
    const u = createUsageTracker({ file, flushMs: 0 })
    u.record('read')
    const s = u.summarize(['read'], tagOf)
    assert.equal(s.unusedTools, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('空名字 / 非字符串不计数', () => {
  const { file, dir } = tmpFile()
  try {
    const u = createUsageTracker({ file, flushMs: 0 })
    u.record('')
    u.record(null)
    u.record(undefined)
    assert.deepEqual(u._raw(), {})
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('写盘内容是可解析的 JSON（带版本号）', () => {
  const { file, dir } = tmpFile()
  try {
    const u = createUsageTracker({ file, flushMs: 0 })
    u.record('read')
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(raw.v, 1)
    assert.equal(raw.tools.read.c, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
