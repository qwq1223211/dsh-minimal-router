#!/usr/bin/env node
/**
 * 复现「尾部提示每轮只占 50~126 token」这个结论。
 *
 * CHANGELOG 里的表：
 *   auto 71 字 ≈50 token / core 117 ≈82 / audio 120 ≈84 / art 138 ≈97
 *   unity-ui 151 ≈106 / unity-code 180 ≈126
 *   占工具声明的 0.09%、占 90 万 token 上下文的 0.01%
 *
 * 这是确定性计算，不需要采样——跑一次就是最终答案。
 *
 * 用法：node scripts/analysis/hint-cost.mjs
 */
import { DEFAULT_STAGES } from '../../index.js'
import { claimedTags } from '../../lib/classify.js'
import { renderHint } from '../../lib/prompt.js'

const claimed = claimedTags(DEFAULT_STAGES)
const stages = Object.keys(DEFAULT_STAGES)

console.log('\n各阶段渲染出来的尾部提示：')
console.log('阶段         | 字符 | 约 token')
console.log('-------------+------+----------')

let sum = 0
let max = 0
for (const stage of stages) {
  const out = renderHint({ stage, stages: DEFAULT_STAGES, claimed })
  const tokens = Math.ceil(out.length * 0.7) // 保守按 0.7 token/字符
  sum += out.length
  max = Math.max(max, out.length)
  console.log(`${stage.padEnd(12)} | ${String(out.length).padStart(4)} | ${String(tokens).padStart(8)}`)
}

const avg = Math.round(sum / stages.length)
console.log(`\n平均 ${avg} 字符/轮，最长 ${max} 字符（硬上限 200）`)

console.log('\n对照一次真实请求（本项目的实测值）：')
console.log('  工具声明：137,790 字节 / 170 个工具')
console.log('  上下文  ：约 900,000 token')
console.log(`  提示    ：约 ${Math.ceil(avg * 0.7)} token`)
console.log(`  占比    ：提示 / 工具声明 = ${((avg / 137790) * 100).toFixed(3)}%`)
console.log(`  占比    ：提示 / 上下文   = ${((Math.ceil(avg * 0.7) / 900000) * 100).toFixed(4)}%`)

console.log('\n结论：')
console.log('  "提示本身是成本噪音"在算术上不成立——它的量级是工具声明的千分之一。')
console.log('  真正需要验证的是它的**行为影响**（模型会不会因此多调工具），用 route_hint 自己跑 A/B。')
