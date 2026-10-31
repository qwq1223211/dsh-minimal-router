/**
 * 活动日志（lib/activity.js）的测试。
 *
 * 这是"它到底干了什么"的唯一证据来源，所以三条性质必须成立：
 *   1. 顺序：最新在前
 *   2. 耐脏：坏行跳过、写盘失败不影响内存
 *   3. 有界：不会无限长
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createActivityLog } from '../lib/activity.js'

function tmpFile() {
  const dir = mkdtempSync(join(tmpdir(), 'router-act-'))
  return { file: join(dir, 'activity.jsonl'), dir }
}

test('记录后能读回，且最新在前', () => {
  const { file, dir } = tmpFile()
  try {
    const a = createActivityLog({ file, flushMs: 0 })
    a.log('switch', { from: 'auto', to: 'core' })
    a.log('deny', { tool: 'unity_object_create', by: 'stage' })
    const ev = a.recent(5)
    assert.equal(ev.length, 2)
    assert.equal(ev[0].kind, 'deny') // 最新在前
    assert.equal(ev[1].kind, 'switch')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('按 kind 过滤', () => {
  const { file, dir } = tmpFile()
  try {
    const a = createActivityLog({ file })
    a.log('deny', { tool: 'x' })
    a.log('switch', { to: 'art' })
    a.log('deny', { tool: 'y' })
    const only = a.recent(10, 'deny')
    assert.equal(only.length, 2)
    assert.ok(only.every((e) => e.kind === 'deny'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('summary 给出人话结论', () => {
  const { file, dir } = tmpFile()
  try {
    const a = createActivityLog({ file })
    a.log('deny', { tool: 'x' })
    a.log('deny', { tool: 'y' })
    a.log('switch', { to: 'core' })
    const s = a.summary()
    assert.equal(s.total, 3)
    assert.equal(s.counts.deny, 2)
    assert.match(s.text, /拦截调用 2 次/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('落盘后重新载入', () => {
  const { file, dir } = tmpFile()
  try {
    const a = createActivityLog({ file })
    a.log('switch', { from: 'auto', to: 'art' })
    const b = createActivityLog({ file })
    assert.equal(b.recent(5)[0].to, 'art')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('坏行跳过，好行照读', () => {
  const { file, dir } = tmpFile()
  try {
    writeFileSync(
      file,
      ['{"t":1,"kind":"switch","to":"core"}', 'not-json', '{"t":2,"kind":"deny"}'].join('\n') + '\n',
      'utf8'
    )
    const a = createActivityLog({ file })
    const ev = a.recent(10)
    assert.equal(ev.length, 2)
    assert.equal(ev[0].kind, 'deny')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('有界：超过 limit 只留最新', () => {
  const { file, dir } = tmpFile()
  try {
    const a = createActivityLog({ file, limit: 10 })
    for (let i = 0; i < 25; i += 1) a.log('deny', { tool: `t${i}` })
    const all = a.recent(200)
    assert.equal(all.length, 10)
    assert.equal(all[0].tool, 't24')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('只存标量：对象字段被丢掉，长字符串被截断', () => {
  const { file, dir } = tmpFile()
  try {
    const a = createActivityLog({ file })
    a.log('deny', { tool: 'x', nested: { a: 1 }, long: 'y'.repeat(300) })
    const ev = a.recent(1)[0]
    assert.equal(ev.nested, undefined)
    assert.ok(ev.long.length <= 120)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('clear 清空内存和文件', () => {
  const { file, dir } = tmpFile()
  try {
    const a = createActivityLog({ file })
    a.log('switch', { to: 'core' })
    a.clear()
    assert.equal(a.recent(5).length, 0)
    assert.equal(readFileSync(file, 'utf8'), '')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
