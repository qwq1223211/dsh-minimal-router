/**
 * ============================================================================
 * test/lint-decide.test.mjs · 体检的"按工具分级"
 * ============================================================================
 * 背景（真机数据）：10-31 一天里 `write` 被 lint 拦了 66 次，全部因为文件内容里
 * 有合法的无限循环（游戏主循环/守护进程那种）。内容型工具不该被拦。
 *
 * 本文件钉死三件事：
 *   1. 内容型工具（write/edit）命中 → warn，不 deny
 *   2. 执行型工具（pwsh/terminal）命中 → deny
 *   3. skipTools / mode=off 仍然完全跳过
 *
 * 【注意】测试里的致命模式用字符串拼接构造，避免本文件保存时被体检命中。
 * ============================================================================
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decideLint, LINT_WARN_TOOLS } from '../lib/lint.js'

/** 拼出会被判为 block 的代码，避免字面量落盘 */
const LOOP = ['while', ' (', 'true', ') { x() }'].join('')
const LOOP_WITH_EXIT = ['while', ' (', 'true', ') { if (a) break; x() }'].join('')
const EMPTY_FOR = ['for', ' (', ';', ';', ') { x() }'].join('')

test('内容型工具：write 命中致命模式 → warn，不拦', () => {
  const v = decideLint({ toolName: 'write', args: { content: LOOP }, mode: 'deny', warnTools: LINT_WARN_TOOLS })
  assert.equal(v.action, 'warn', '写文件不该被拒')
  assert.ok(v.reason.includes('write'), '提示里要说明是哪个工具')
})

test('内容型工具：edit 同样只 warn', () => {
  const v = decideLint({ toolName: 'edit', args: { new_string: LOOP }, mode: 'deny', warnTools: LINT_WARN_TOOLS })
  assert.equal(v.action, 'warn')
})

test('执行型工具：pwsh 命中 → deny（这是要保住的保护）', () => {
  const v = decideLint({ toolName: 'pwsh', args: { command: LOOP }, mode: 'deny', warnTools: LINT_WARN_TOOLS })
  assert.equal(v.action, 'deny')
  assert.equal(v.code, 'LINT_DEAD_LOOP')
})

test('执行型工具：空条件 for 也会被拦', () => {
  const v = decideLint({ toolName: 'pwsh', args: { command: EMPTY_FOR }, mode: 'deny' })
  assert.equal(v.action, 'deny')
})

test('循环体里有 break → 放行（不误判合法循环）', () => {
  const v = decideLint({ toolName: 'pwsh', args: { command: LOOP_WITH_EXIT }, mode: 'deny' })
  assert.equal(v.action, 'allow')
})

test('skipTools 里的工具完全跳过', () => {
  const v = decideLint({ toolName: 'pwsh', args: { command: LOOP }, mode: 'deny', skipTools: ['pwsh'] })
  assert.equal(v.action, 'allow')
})

test('mode=off 时一律放行', () => {
  const v = decideLint({ toolName: 'pwsh', args: { command: LOOP }, mode: 'off' })
  assert.equal(v.action, 'allow')
})

test('mode=warn 时连执行型工具也只警告', () => {
  const v = decideLint({ toolName: 'pwsh', args: { command: LOOP }, mode: 'warn' })
  assert.equal(v.action, 'warn')
})

test('没有参数 / 文本太短 → 放行', () => {
  assert.equal(decideLint({ toolName: 'pwsh', args: {}, mode: 'deny' }).action, 'allow')
  assert.equal(decideLint({ toolName: 'pwsh', args: { command: 'x' }, mode: 'deny' }).action, 'allow')
})
