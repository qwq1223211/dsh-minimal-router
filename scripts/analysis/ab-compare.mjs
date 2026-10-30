#!/usr/bin/env node
/**
 * A/B 对照：比较两个会话的真实账单。
 *
 * 【这个脚本能回答什么、不能回答什么】
 *   能：两个会话各自发了多少工具、命中率多少、总共多少 token —— 这些都是探针实测的。
 *   不能：它**不会**替你算出"装了就省 X%"。两个会话的对话内容不可能完全相同，
 *        所以总 token 的差异里混着"模型话多话少"这个变量。
 *        真正干净的对比是 **toolsChars**（确定性：只由工具表决定）和 **hitRate**。
 *
 * 用法：
 *   node scripts/analysis/ab-compare.mjs                     # 列出所有会话
 *   node scripts/analysis/ab-compare.mjs --session 8c14 --session 4a2f   # 对比两个（支持前缀）
 */
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const dataFiles = []
const sessionArgs = []
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--data' && args[i + 1]) dataFiles.push(args[i + 1])
  if (args[i] === '--session' && args[i + 1]) sessionArgs.push(args[i + 1])
}
if (dataFiles.length === 0) dataFiles.push(join(homedir(), '.dsh', 'minimal-router', 'usage.jsonl'))

const records = []
for (const file of dataFiles) {
  if (!existsSync(file)) continue
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

// 按会话分组（老记录 session 为空串，单独归为 '(未标注)'）
const groups = new Map()
for (const record of records) {
  const key = typeof record.session === 'string' && record.session ? record.session : '(未标注)'
  const list = groups.get(key) || []
  list.push(record)
  groups.set(key, list)
}

function statsOf(list) {
  const n = list.length
  const prompt = list.reduce((s, r) => s + (r.promptTokens || 0), 0)
  const cached = list.reduce((s, r) => s + (r.cacheReadTokens || 0), 0)
  const fresh = list.reduce((s, r) => s + (r.inputTokens || 0), 0)
  const last = list[list.length - 1] || {}
  const hitRate = prompt > 0 ? cached / prompt : 0
  let prefixChanges = 0
  for (let i = 1; i < list.length; i += 1) {
    if (list[i].prefixSig && list[i - 1].prefixSig && list[i].prefixSig !== list[i - 1].prefixSig) prefixChanges += 1
  }
  return {
    requests: n,
    promptTokens: prompt,
    inputTokens: fresh,
    cacheReadTokens: cached,
    hitRate,
    prefixChanges,
    toolsChars: last.toolsChars || 0,
    tools: last.tools || 0,
    first: list[0] && list[0].iso,
    last: last.iso,
  }
}

if (sessionArgs.length === 0) {
  console.log(`\n共 ${records.length} 条记录，${groups.size} 个会话\n`)
  console.log('会话指纹   | 请求数 |  promptTokens  | 全价token | 命中率 | 工具字节 | 前缀变化 | 最后时间')
  console.log('-----------+--------+----------------+-----------+--------+----------+----------+-------------------------')
  const rows = [...groups.entries()].map(([key, list]) => ({ key, ...statsOf(list) }))
  rows.sort((a, b) => b.promptTokens - a.promptTokens)
  for (const row of rows.slice(0, 25)) {
    console.log(
      `${row.key.padEnd(10)} | ${String(row.requests).padStart(6)} | ${String(row.promptTokens).padStart(14)} | ` +
        `${String(row.inputTokens).padStart(9)} | ${(row.hitRate * 100).toFixed(1).padStart(5)}% | ${String(row.toolsChars).padStart(8)} | ` +
        `${String(row.prefixChanges).padStart(8)} | ${String(row.last).slice(0, 23)}`,
    )
  }
  console.log('\n挑两个会话来对比：')
  console.log('  node scripts/analysis/ab-compare.mjs --session <前几位> --session <前几位>')
  console.log('\n协议见 docs/AB.md（怎么跑出一对可比的会话）。\n')
  process.exit(0)
}

// 找出两个匹配的会话（允许只给前几位）
const picked = sessionArgs.map((prefix) => {
  const hit = [...groups.keys()].find((key) => key.startsWith(prefix))
  return hit ? { key: hit, list: groups.get(hit) } : { key: null, list: [] }
})

if (picked.some((p) => !p.key)) {
  console.error('找不到匹配的会话，可用前缀：', [...groups.keys()].join(', '))
  process.exit(1)
}
if (picked.length !== 2) {
  console.error('需要正好两个 --session')
  process.exit(1)
}

const [a, b] = picked.map((p) => ({ key: p.key, ...statsOf(p.list) }))
const pct = (from, to) => (from === 0 ? '—' : `${(((to - from) / from) * 100).toFixed(1)}%`)

console.log(`\n对照：A = ${a.key}   B = ${b.key}\n`)
console.log('指标              |            A |            B |     变化 (B vs A)')
console.log('------------------+--------------+--------------+-------------------')
const rows = [
  ['请求数', a.requests, b.requests],
  ['promptTokens 合计', a.promptTokens, b.promptTokens],
  ['  其中全价 token', a.inputTokens, b.inputTokens],
  ['  其中命中 token', a.cacheReadTokens, b.cacheReadTokens],
  ['工具声明字节（末次）', a.toolsChars, b.toolsChars],
  ['工具数（末次）', a.tools, b.tools],
  ['前缀重建次数', a.prefixChanges, b.prefixChanges],
]
for (const [label, av, bv] of rows) {
  console.log(`${String(label).padEnd(17)} | ${String(av).padStart(12)} | ${String(bv).padStart(12)} | ${pct(av, bv).padStart(17)}`)
}
console.log(`${'命中率'.padEnd(17)} | ${((a.hitRate * 100).toFixed(1) + '%').padStart(12)} | ${((b.hitRate * 100).toFixed(1) + '%').padStart(12)} |`)

console.log('\n判读（按可信度从高到低）：')
console.log(`  1. 工具声明字节：${a.toolsChars} → ${b.toolsChars}（${pct(a.toolsChars, b.toolsChars)}）`)
console.log('     这是**确定性**的差异——只由工具表决定，与模型说了什么无关。这是最干净的证据。')
console.log(`  2. 命中率：${(a.hitRate * 100).toFixed(1)}% → ${(b.hitRate * 100).toFixed(1)}%`)
console.log('     差距大说明某一侧的缓存被反复打断（切阶段/重载插件都会这样）。')
console.log(`  3. promptTokens 合计：${a.promptTokens} → ${b.promptTokens}`)
console.log('     ⚠ 这个差异里混着"这次对话有多长"。除非两边问的完全一样，否则不要当成省钱幅度。')
console.log('')
