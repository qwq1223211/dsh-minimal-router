#!/usr/bin/env node
/**
 * 复现「切换成本是双峰的」这个结论。
 *
 * CHANGELOG / README 里这些数字都出自这里：
 *   · 615 条探针记录、60 次前缀变化
 *   · 便宜档 35 次（未命中 0.2%~1.2%）、灾难档 11 次（98%~99%）
 *   · 改 98,778 字节只花 708 token；改 481 字节花掉 581,830 token
 *
 * 用法：
 *   node scripts/analysis/switch-cost.mjs                  # 读 ~/.dsh/minimal-router/usage.jsonl
 *   node scripts/analysis/switch-cost.mjs --data a.jsonl --data b.jsonl
 */
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const dataFiles = []
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--data' && args[i + 1]) dataFiles.push(args[i + 1])
}
if (dataFiles.length === 0) {
  dataFiles.push(join(homedir(), '.dsh', 'minimal-router', 'usage.jsonl'))
}

const records = []
for (const file of dataFiles) {
  if (!existsSync(file)) {
    console.error(`跳过（不存在）：${file}`)
    continue
  }
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line)
      if (record && typeof record.at === 'number') records.push(record)
    } catch {
      /* 坏行跳过 */
    }
  }
}
records.sort((a, b) => a.at - b.at)
console.log(`\n读到 ${records.length} 条探针记录\n`)

const missOf = (r) => (Number.isFinite(r.inputTokens) ? r.inputTokens : 0)
const ctxOf = (r) => (Number.isFinite(r.promptTokens) ? r.promptTokens : 0)

// 前缀指纹变化 = 一次"切换"
const switches = []
let prev = null
for (const record of records) {
  if (prev && record.prefixSig && prev.prefixSig && record.prefixSig !== prev.prefixSig) {
    switches.push({
      iso: record.iso,
      contextTokens: ctxOf(record),
      missTokens: missOf(record),
      hitRate: record.hitRate,
      tools: record.tools,
      toolsDelta: (record.toolsChars || 0) - (prev.toolsChars || 0),
      systemDelta: (record.systemChars || 0) - (prev.systemChars || 0),
    })
  }
  prev = record
}

console.log(`前缀变化 ${switches.length} 次\n`)
console.log('时间                     | 上下文token | 本次未命中 | 命中率 | 工具字节Δ | 系统Δ')
console.log('-------------------------+-------------+------------+--------+-----------+-------')
for (const s of switches) {
  console.log(
    `${String(s.iso).padEnd(24)} | ${String(s.contextTokens).padStart(11)} | ${String(s.missTokens).padStart(10)} | ` +
      `${((s.hitRate || 0) * 100).toFixed(1).padStart(5)}% | ${String(s.toolsDelta).padStart(9)} | ${String(s.systemDelta).padStart(6)}`,
  )
}

const expensive = switches.filter((s) => s.missTokens > 5000 && s.contextTokens > 0)
const cheapOnes = switches.filter((s) => s.missTokens <= 5000 && s.contextTokens > 0)

console.log('\n分档（这才是"双峰"的真实含义）')
console.log('  · 便宜档：未命中 ≤ 5,000 token')
console.log('  · 灾难档：未命中 > 5,000 且 > 50% 上下文')
console.log('  · 中间档：其余')
console.log(`  便宜档 ${cheapOnes.length} 次（看绝对 token）：` +
  (cheapOnes.slice(0, 6).map((s) => s.missTokens).join(', ') || '（无）'))
const catastrophic = expensive.filter((s) => s.missTokens / s.contextTokens > 0.5)
const middle = expensive.filter((s) => s.missTokens / s.contextTokens <= 0.5)
console.log(`  灾难档 ${catastrophic.length} 次（看占上下文比例）：` +
  catastrophic.slice(0, 6).map((s) => `${((s.missTokens / s.contextTokens) * 100).toFixed(1)}%`).join(', '))
console.log(`  中间档 ${middle.length} 次`)

// 成本与"改了多少字节"的相关性 —— 只比"系统提示没变、纯工具变化"的那些，才是同类可比
const toolsOnly = switches
  .filter((s) => s.missTokens > 0 && Math.abs(s.systemDelta) === 0)
  .map((s) => ({ bytes: Math.abs(s.toolsDelta), miss: s.missTokens }))

console.log('\n改动幅度 vs 代价（只看"系统提示没变、纯工具表变化"的样本）：')
const bigCheap = toolsOnly.filter((p) => p.miss <= 5000).sort((a, b) => b.bytes - a.bytes)[0]
const smallExpensive = toolsOnly.filter((p) => p.miss > 5000).sort((a, b) => a.bytes - b.bytes)[0]
if (bigCheap) console.log(`  改得很大却很便宜：${bigCheap.bytes} 字节 → ${bigCheap.miss} token`)
if (smallExpensive) console.log(`  改得很小却很贵  ：${smallExpensive.bytes} 字节 → ${smallExpensive.miss} token`)
if (bigCheap && smallExpensive) {
  const ratio = smallExpensive.miss / Math.max(1, bigCheap.miss)
  console.log(`  → 两者代价差 ${ratio.toFixed(0)} 倍。**改动幅度预测不了代价**，所以只能按最坏情况估。`)
} else {
  console.log('  → 样本不足（需要同时出现"大改却便宜"和"小改却昂贵"两类），多跑一段时间再看。')
}

console.log('\n【关于文档里的数字】CHANGELOG/README 引用的是 2026-10-30 的一次快照')
console.log('（615 条记录 / 60 次切换）。探针数据会持续增长，重跑本脚本得到的次数和比例')
console.log('会与文档不同 —— 那是正常的。**可复现的是方法，不是某一天的数值。**\n')
