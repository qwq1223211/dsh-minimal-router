#!/usr/bin/env node
/**
 * 从 CHANGELOG.md 里抽出某个版本的段落，供 GitHub Release 使用。
 *
 * 用法：
 *   node scripts/changelog-section.mjs v1.8.0        → 打印该版本正文
 *   node scripts/changelog-section.mjs 1.8.0         → 同上（v 前缀可省）
 *
 * 找不到就打印一段兜底的提示并退出码 0 —— 发版流程不该因为文案缺失而失败。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = (process.argv[2] || '').trim().replace(/^v/i, '')

if (!raw) {
  console.error('用法：node scripts/changelog-section.mjs v1.8.0')
  process.exit(2)
}

let changelog = ''
try {
  changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
} catch {
  console.log(`## v${raw}\n\n（CHANGELOG.md 缺失）`)
  process.exit(0)
}

const lines = changelog.split('\n')
const isHeading = (line) => /^##\s+\[/.test(line.trim())

let start = -1
for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i].trim()
  if (!isHeading(line)) continue
  // 支持 ## [1.8.0] — 2026-10-30 / ## [1.8.0] 两种写法
  const match = line.match(/^##\s+\[([^\]]+)\]/)
  if (match && match[1].trim().replace(/^v/i, '') === raw) {
    start = i + 1
    break
  }
}

if (start === -1) {
  console.log(`## v${raw}\n\n（CHANGELOG 里没有 ${raw} 的段落，请补一条再发版）`)
  process.exit(0)
}

let end = lines.length
for (let i = start; i < lines.length; i += 1) {
  if (isHeading(lines[i].trim())) {
    end = i
    break
  }
}

const body = lines.slice(start, end).join('\n').trim()
console.log(`## v${raw}\n\n${body}\n`)
