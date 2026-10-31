#!/usr/bin/env node
/**
 * 仓库级自检（零依赖）。CI 里跑，本地也能跑。
 *
 * 【为什么需要它】这个项目被"文件编码被写坏"坑过两次：
 * 用 PowerShell 做正则替换，UTF-8 被当 GBK 读写，中文全变乱码 + BOM，
 * 结果 `SyntaxError: Invalid or unexpected token` —— 而且**肉眼看不出来**（控制台会把
 * UTF-8 显示成乱码，逆操作也一样）。
 * 所以编码规则必须机器检查，不能靠看。
 *
 * 检查项：
 *   1. 没有 BOM、没有 U+FFFD、没有典型乱码串、统一 LF 换行
 *   2. package.json 的 main / exports 一致，files 声明的文件都存在
 *   3. lib/ 里不许出现 console.log（库代码不该往 stdout 打印）
 *   4. 每个 export 的函数/常量上面必须有 JSDoc
 *   5. index.js 体积守卫（防止又长回一个巨型文件）
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []
const warnings = []

/** 递归收集源文件（跳过 node_modules / .git / data） */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'data', 'Library'].includes(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const TEXT_EXT = /\.(m?js|json|md|yml|yaml|txt)$/i
/** 典型 UTF-8→GBK 误读留下的字符，正常中文里几乎不会出现 */
const MOJIBAKE = /[鈫鎸锛鏋鍣绫銆鐨勮嚜娴嬭剼]/
const SELF = fileURLToPath(import.meta.url)

/** 去掉注释（只看"真代码"，否则文档里提到 console.log 会被误判） */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// ---------------------------------------------------------------------------
// 1. 编码与换行
// ---------------------------------------------------------------------------
for (const file of walk(root)) {
  if (!TEXT_EXT.test(file)) continue
  // 检查脚本自己必然含有乱码特征串（就是它要检测的东西），跳过
  if (file === SELF) continue
  const raw = readFileSync(file, 'utf8')
  const rel = relative(root, file)
  if (raw.charCodeAt(0) === 0xfeff) problems.push(`${rel}: 有 BOM（会破坏 JSON/JS 解析）`)
  if (raw.includes('\ufffd')) problems.push(`${rel}: 含 U+FFFD 替换字符（编码被破坏）`)
  if (MOJIBAKE.test(raw)) problems.push(`${rel}: 含典型乱码串（UTF-8 被当 GBK 读写过）`)
  // 只对代码/配置要求 LF；markdown 允许（表格偶尔带 CRLF 也无害）
  if (/\.(m?js|json|yml|yaml)$/i.test(file) && raw.includes('\r\n')) {
    problems.push(`${rel}: 含 CRLF 换行（.gitattributes 要求 LF）`)
  }
}

// ---------------------------------------------------------------------------
// 2. package.json 结构与 files 一致性
// ---------------------------------------------------------------------------
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (pkg.main && pkg.exports && pkg.exports['.']) {
  if (pkg.main.replace(/^\.\//, '') !== String(pkg.exports['.']).replace(/^\.\//, '')) {
    problems.push(`package.json: main(${pkg.main}) 与 exports["."](${pkg.exports['.']}) 不一致`)
  }
}
for (const entry of pkg.files || []) {
  if (entry.includes('*')) {
    const [dir, pattern] = entry.split('/')
    if (!existsSync(join(root, dir))) problems.push(`package.json files: 目录不存在 ${dir}`)
    else {
      const suffix = pattern.replace('*', '')
      if (readdirSync(join(root, dir)).filter((n) => n.endsWith(suffix)).length === 0) {
        problems.push(`package.json files: ${entry} 一个都没匹配到`)
      }
    }
  } else if (!existsSync(join(root, entry))) {
    problems.push(`package.json files: 文件不存在 ${entry}`)
  }
}

// ---------------------------------------------------------------------------
// 3. 库代码不许 console.log
// ---------------------------------------------------------------------------
for (const file of readdirSync(join(root, 'lib'))) {
  const path = join(root, 'lib', file)
  const text = stripComments(readFileSync(path, 'utf8'))
  if (/console\.log\(/.test(text)) {
    problems.push(`lib/${file}: 含 console.log（库代码请用 console.warn / console.info）`)
  }
}

// ---------------------------------------------------------------------------
// 4. export 必须有 JSDoc
// ---------------------------------------------------------------------------
for (const dir of ['lib', '.']) {
  const files = dir === '.' ? ['index.js'] : readdirSync(join(root, 'lib')).map((f) => `lib/${f}`)
  for (const rel of files) {
    const text = readFileSync(join(root, rel), 'utf8')
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      const m = line.match(/^export\s+(?:async\s+)?(?:function\*?|function|const|let)\s+([A-Za-z0-9_$]+)/)
      if (!m) return
      // 往上找 3 行内有没有 */
      const window = lines.slice(Math.max(0, i - 3), i).join('\n')
      if (!window.includes('*/')) warnings.push(`${rel}:${i + 1} export ${m[1]} 上面没有 JSDoc`)
    })
  }
}

// ---------------------------------------------------------------------------
// 5. 体积守卫
// ---------------------------------------------------------------------------
const INDEX = join(root, 'index.js')
/**
 * 只数**代码行**：去掉块注释、行注释和空行。
 *
 * 【为什么要改】原来这条守卫数的是原始行数，而 index.js 有多达 27% 是注释——
 * 于是"多写一段解释"和"多写一段逻辑"被同等惩罚。那是在奖励少写注释。
 * 现在按代码行数算，阈值也重新校准过（当前 ~1105 行）。
 */
function codeLineCount(file) {
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return text.split('\n').filter((line) => line.trim() && !line.trim().startsWith('//')).length
}
const indexCodeLines = codeLineCount(INDEX)
if (indexCodeLines > 1200) {
  // 超线时不要输出负数余量（1200 - N 会是负的），直接说超了多少
  problems.push(
    `index.js 有 ${indexCodeLines} 行代码（不含注释），已超 1200 行守卫线 ${indexCodeLines - 1200} 行——该拆了（见 docs/ROADMAP.md 的三段拆分）`,
  )
} else if (indexCodeLines > 1100) {
  warnings.push(
    `index.js 有 ${indexCodeLines} 行代码（不含注释），距 1200 行守卫线还剩 ${1200 - indexCodeLines} 行`,
  )
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
console.log('')
for (const w of warnings) console.log(`  ⚠ ${w}`)
if (problems.length === 0) {
  console.log(`\n  ✔ 仓库自检通过（${warnings.length} 条提醒，0 个问题）\n`)
  process.exit(0)
}
console.log(`\n  ✘ 发现 ${problems.length} 个问题：`)
for (const p of problems) console.log(`    · ${p}`)
console.log('')
process.exit(1)
