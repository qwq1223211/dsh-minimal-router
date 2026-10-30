#!/usr/bin/env node
/**
 * 一键升版本：把 package.json + 三个 README 标题一起改掉。
 *
 * 【为什么需要它】改版本号以前是"手工改 4 个地方"，于是漏了一个——
 * README 停 v1.3.0、package.json 已经是 v1.8.0、Release 标题又是第三个数字。
 * 现在只要一条命令，改完还会自检。
 *
 * 用法：
 *   node scripts/bump.mjs 1.9.0           → 真正改
 *   node scripts/bump.mjs 1.9.0 --dry     → 只看会改什么
 *
 * 注意：它**不会**替你写 CHANGELOG 段落（那需要人写），但会提醒你补。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = (process.argv[2] || '').trim().replace(/^v/i, '')
const dry = process.argv.includes('--dry')

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('用法：node scripts/bump.mjs 1.9.0 [--dry]')
  process.exit(2)
}

const targets = [
  { file: 'package.json', pattern: /"version":\s*"[^"]*"/, replacement: `"version": "${version}"` },
  { file: 'README.md', pattern: /^(# .*?)v\d+\.\d+\.\d+/m, replacement: `$1v${version}` },
  { file: 'README.en.md', pattern: /^(# .*?)v\d+\.\d+\.\d+/m, replacement: `$1v${version}` },
  { file: 'README.zh.md', pattern: /^(# .*?)v\d+\.\d+\.\d+/m, replacement: `$1v${version}` },
]

let changed = 0
for (const t of targets) {
  const path = join(root, t.file)
  const before = readFileSync(path, 'utf8')
  const beforeVersion = (before.match(/v?(\d+\.\d+\.\d+)/) || [])[1] || '?'
  let after = before
  if (t.file === 'package.json') {
    after = before.replace(t.pattern, t.replacement)
  } else {
    after = before.replace(t.pattern, t.replacement)
  }
  if (after === before) {
    if (before.includes(version)) console.log(`  · ${t.file}：已经是 v${version}，跳过`)
    else console.log(`  · ${t.file}：没匹配到版本号格式，跳过（请人工确认）`)
    continue
  }
  changed += 1
  console.log(`  · ${t.file}：v${beforeVersion} → v${version}${dry ? '（dry-run，未写入）' : ''}`)
  if (!dry) writeFileSync(path, after, 'utf8')
}

console.log(`\n共 ${changed} 个文件${dry ? '会被修改' : '已修改'}。`)

// CHANGELOG 提醒
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
const hasSection = new RegExp(`^##\\s+\\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(changelog)
if (!hasSection) {
  console.log(`\n⚠ CHANGELOG.md 里还没有 [${version}] 段落，请补一段再发版（否则 Release 正文是空的）。`)
} else {
  console.log(`\n✔ CHANGELOG.md 里已有 [${version}] 段落。`)
}

console.log(`\n下一步：`)
console.log(`  1. 补 CHANGELOG（如果还没写）`)
console.log(`  2. git add -A && git commit -m "release: v${version}"`)
console.log(`  3. node scripts/verify-version.mjs v${version}   # 自检三处一致`)
console.log(`  4. git tag -a v${version} -m "v${version}" && git push && git push origin v${version}`)
console.log(`  5. tag 推上去之后，Release 由 CI 自动创建（.github/workflows/release.yml）`)
