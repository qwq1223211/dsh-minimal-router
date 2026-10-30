#!/usr/bin/env node
/**
 * 发版前自检：tag / package.json / 三个 README 的版本号必须完全一致。
 *
 * 【为什么需要它】v1.3.0 那次我只改了 package.json，README 标题一直停在 v1.3.0，
 * 而 Release 标题又是另一个数字——三处数字互相矛盾，用户看到的第一屏就是错的。
 * 这个脚本把"发版"变成一个会失败的操作，而不是一个靠记性的操作。
 *
 * 用法：
 *   node scripts/verify-version.mjs v1.8.0    → 不一致就退出码 1
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tag = (process.argv[2] || '').trim().replace(/^v/i, '')
if (!tag) {
  console.error('用法：node scripts/verify-version.mjs v1.8.0')
  process.exit(2)
}

const problems = []

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (pkg.version !== tag) problems.push(`package.json 是 ${pkg.version}，tag 是 ${tag}`)

const readmes = ['README.md', 'README.en.md', 'README.zh.md']
for (const name of readmes) {
  let text = ''
  try {
    text = readFileSync(join(root, name), 'utf8')
  } catch {
    problems.push(`${name} 读不到`)
    continue
  }
  const first = text.split('\n')[0] || ''
  // 标题里必须出现 vX.Y.Z 且等于 tag
  const found = first.match(/v(\d+\.\d+\.\d+)/)
  if (!found) problems.push(`${name} 首行没有版本号：${first.slice(0, 60)}`)
  else if (found[1] !== tag) problems.push(`${name} 首行是 v${found[1]}，tag 是 v${tag}`)
}

// CHANGELOG 必须有这个版本的段落
let changelog = ''
try {
  changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
} catch {
  problems.push('CHANGELOG.md 读不到')
}
if (changelog && !new RegExp(`^##\\s+\\[${tag.replace(/\./g, '\\.')}\\]`, 'm').test(changelog)) {
  problems.push(`CHANGELOG.md 里没有 [${tag}] 的段落`)
}

if (problems.length > 0) {
  console.error('✘ 版本号不一致，拒绝发版：')
  for (const p of problems) console.error('  · ' + p)
  process.exit(1)
}

console.log(`✔ 版本号一致：v${tag}（package.json / README.md / README.en.md / README.zh.md / CHANGELOG）`)
