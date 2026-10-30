#!/usr/bin/env node
/**
 * 复现「冷却 60 秒 / 时间窗 5 分钟」这两个默认值的来源。
 *
 * CHANGELOG 里这句数字出自这里：
 *   P25 = 2.0s / 中位数 9.0s / P75 = 81.1s / P90 = 433s
 *   43% 的相邻切换发生在 5 秒内、71% 在 60 秒内
 *
 * 用法：
 *   node scripts/analysis/switch-gaps.mjs
 *   node scripts/analysis/switch-gaps.mjs --data a.jsonl --data b.jsonl
 */
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const dataFiles = []
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--data' && args[i + 1]) dataFiles.push(args[i + 1])
}
if (dataFiles.length === 0) dataFiles.push(join(homedir(), '.dsh', 'minimal-router', 'usage.jsonl'))

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

const switches = []
let prevSig = ''
for (const record of records) {
  if (record.prefixSig && prevSig && record.prefixSig !== prevSig) switches.push(record.at)
  if (record.prefixSig) prevSig = record.prefixSig
}

console.log(`\n记录 ${records.length} 条，切换 ${switches.length} 次\n`)
if (switches.length < 2) {
  console.log('切换次数不足，无法统计间隔。多跑一段会话再来看。\n')
  process.exit(0)
}

const gaps = []
for (let i = 1; i < switches.length; i += 1) gaps.push(switches[i] - switches[i - 1])
gaps.sort((a, b) => a - b)

const pct = (p) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))]
const sec = (ms) => `${((ms || 0) / 1000).toFixed(1)}s`

console.log('相邻两次切换的间隔：')
console.log('  P10   :', sec(pct(0.1)))
console.log('  P25   :', sec(pct(0.25)))
console.log('  中位数:', sec(pct(0.5)))
console.log('  P75   :', sec(pct(0.75)))
console.log('  P90   :', sec(pct(0.9)))

console.log('\n落在各时间窗内的比例：')
for (const ms of [1000, 5000, 15000, 60000, 120000, 300000]) {
  const n = gaps.filter((g) => g <= ms).length
  console.log(`  ≤ ${String(ms / 1000).padStart(4)}s : ${String(n).padStart(3)}/${gaps.length} = ${((n / gaps.length) * 100).toFixed(0)}%`)
}

console.log('\n判读：')
console.log('  · 大量间隔 ≤ 几秒 → 存在"连续抖动"，冷却能直接吃掉它们。')
console.log('  · 中位数很大 → 切换本来就不频繁，冷却设太大反而误伤真实需求。')
console.log(`  · 当前默认：switchCooldownMs=60000（覆盖 ≤60s 的抖动），switchConfirmWindowMs=300000（>P75）。`)
