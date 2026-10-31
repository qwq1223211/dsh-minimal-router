#!/usr/bin/env node
/**
 * ============================================================================
 * dsh-minimal-router · scripts/tune.mjs
 * ============================================================================
 * 读你**本机真实数据**，给出调参建议。
 *
 * 数据来源（都在 ~/.dsh/minimal-router/）：
 *   activity.jsonl   它实际做了什么（切阶段 / 拦截 / 闸门）
 *   tool-usage.json  每个工具被调用过几次（空转画像）
 *   usage.jsonl      探针记录（每次请求的真实 token）
 *
 * 用法：
 *   node scripts/tune.mjs
 *   node scripts/tune.mjs --days 7     # 只看最近 7 天
 * ============================================================================
 */

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DIR = join(homedir(), '.dsh', 'minimal-router')
const args = process.argv.slice(2)
const daysIdx = args.indexOf('--days')
const DAYS = daysIdx >= 0 ? Number(args[daysIdx + 1]) || 7 : 7
const CUTOFF = Date.now() - DAYS * 24 * 3600 * 1000

const C = {
  b: '\x1b[1m',
  dim: '\x1b[2m',
  grn: '\x1b[32m',
  yel: '\x1b[33m',
  red: '\x1b[31m',
  cy: '\x1b[36m',
  r: '\x1b[0m',
}

function line(title) {
  console.log(`\n${C.b}${title}${C.r}`)
  console.log('-'.repeat(56))
}

function readJsonl(file) {
  if (!existsSync(file)) return []
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

const activity = readJsonl(join(DIR, 'activity.jsonl')).filter((e) => (e.t || 0) >= CUTOFF)
const blocks = activity.filter((e) => e.kind === 'block')
const usageRaw = existsSync(join(DIR, 'tool-usage.json'))
  ? JSON.parse(readFileSync(join(DIR, 'tool-usage.json'), 'utf8'))
  : { tools: {} }
const usage = usageRaw.tools || {}

console.log(`${C.b}dsh-minimal-router · 本机数据体检${C.r}`)
console.log(`${C.dim}数据目录：${DIR}${C.r}`)
console.log(`${C.dim}时间窗：最近 ${DAYS} 天${C.r}`)

// ---------------------------------------------------------------- 活动
line('一、它到底做了什么')
if (activity.length === 0) {
  console.log(`${C.yel}还没有活动记录。${C.r} 说明这段时间里：没切过阶段、没拦过调用。`)
  console.log(`${C.dim}这通常意味着「默认 auto + 没开瘦身」——它确实什么都没干。${C.r}`)
} else {
  const counts = {}
  for (const e of activity) counts[e.kind] = (counts[e.kind] || 0) + 1
  const label = {
    switch: '切阶段',
    restrict: '改工具表',
    deny: '拦调用',
    block: '闸门拦截',
    grant: '临时收窄',
    reset: '复位',
    degrade: '降级',
  }
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${label[k] || k.padEnd(8)} ${String(v).padStart(4)} 次`)
  }
  const byCost = blocks.filter((e) => e.by === 'cost').length
  const byCtx = blocks.filter((e) => e.by === 'context').length
  if (blocks.length) {
    console.log(`\n  ${C.dim}闸门拦截拆开看：成本闸门 ${byCost} 次，上下文闸门 ${byCtx} 次${C.r}`)
  }
}

// ---------------------------------------------------------------- 空转
line('二、哪些工具从没被用过')
const names = Object.keys(usage)
const neverUsed = Object.entries(usage).filter(([, v]) => !v || !v.c)
console.log(`  记录到的工具：${names.length} 个`)
if (names.length === 0) {
  console.log(`  ${C.yel}还没有调用记录${C.r}（usageTracking 关着，或者确实一次都没调过工具）`)
} else {
  console.log(`  从没被调用：${C.red}${neverUsed.length}${C.r} 个`)
  const top = Object.entries(usage)
    .filter(([, v]) => v && v.c)
    .sort((a, b) => b[1].c - a[1].c)
    .slice(0, 5)
  console.log(`\n  用得最多：`)
  for (const [n, v] of top) console.log(`    ${n.padEnd(34)} ${String(v.c).padStart(4)} 次`)
}

// ---------------------------------------------------------------- 建议
line('三、调参建议')
const advice = []
if (activity.filter((e) => e.kind === 'deny').length > 20) {
  const rec = activity.filter((e) => e.kind === 'deny').length
  advice.push(`拦截了 ${rec} 次调用 —— 如果模型经常放弃，把 intentMinScore 调低、或把常用组加进 allow`)
}
if (activity.filter((e) => e.kind === 'switch').length === 0 && names.length > 0) {
  advice.push('有工具调用但从没切阶段 —— 说明关键词/语义都没命中；考虑给 route_init 生成的表补关键词')
}
if (neverUsed.length > names.length * 0.5) {
  advice.push(`超过一半工具没被用过（${neverUsed.length}/${names.length}）—— 可以卸掉对应插件，比路由更省`)
}
if (blocks.filter((e) => e.by === 'cost').length > 3) {
  advice.push('成本闸门频繁拦截 —— 你的会话普遍很大；建议开新会话，而不是硬切阶段')
}
if (advice.length === 0) advice.push('数据还太少，先正常用几天再看')
for (const a of advice) console.log(`  · ${a}`)

console.log(`\n${C.dim}提示：这些数字全部来自本机文件，没有上传到任何地方。${C.r}`)
