#!/usr/bin/env node
/**
 * 零依赖覆盖率统计（用 Node 内置的 V8 coverage，不需要装 c8/istanbul）。
 *
 * 原理：
 *   1. 设 NODE_V8_COVERAGE=<临时目录>，Node 会把每个进程的原始覆盖率写成 JSON
 *   2. 每个脚本的覆盖率是「偏移区间 + 执行次数」，需要自己映射回行号
 *   3. "可执行行" ≈ 出现在任意区间里的行；"已覆盖行" ≈ 出现在 count>0 区间里的行
 *      （这是近似——没有 parser 就分不清空行/纯注释，但这个近似对 ESM 短文件足够稳）
 *
 * 跑法：
 *   node scripts/coverage.mjs             # 跑全部测试，打印汇总
 *   node scripts/coverage.mjs --json      # 只输出 JSON
 *   node scripts/coverage.mjs --min 70    # 覆盖率低于 70% 就退出码 1（给 CI 用）
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const asJson = args.includes('--json')
const minIdx = args.indexOf('--min')
const minPct = minIdx >= 0 ? Number(args[minIdx + 1]) : null

const SUITES = [
  'test/router.test.mjs',
  'test/guard.test.mjs',
  'test/probe.test.mjs',
  'test/fuzz.test.mjs',
  'test/instrument.test.mjs',
  'test/install-elsewhere.test.mjs',
  'test/migration.test.mjs',
  'test/intent.test.mjs',
  'test/usage.test.mjs',
  'test/adaptive.test.mjs',
  'test/activity.test.mjs',
  'test/feedback.test.mjs',
]

const covDir = mkdtempSync(join(tmpdir(), 'dsh-cov-'))
const failures = []

try {
  for (const suite of SUITES) {
    // stdio 必须 inherit：沙箱里 piped stdio 可能直接 EPERM
    const result = spawnSync(process.execPath, [suite], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_V8_COVERAGE: covDir },
    })
    if (result.status !== 0) failures.push(suite)
  }

  // ---- 读取并合并所有进程的覆盖数据 ----
  /** url → Map<lineNumber, covered> */
  const perFile = new Map()

  const files = readdirSync(covDir).filter((f) => f.endsWith('.json'))
  for (const name of files) {
    let data
    try {
      data = JSON.parse(readFileSync(join(covDir, name), 'utf8'))
    } catch {
      continue
    }
    for (const script of data.result || []) {
      const url = script.url || ''
      if (!url.startsWith('file://')) continue
      const abs = fileURLToPath(url)
      // 只看仓库自己的源码，跳过测试、脚本和外部依赖
      if (!abs.startsWith(ROOT)) continue
      const rel = relative(ROOT, abs).split('\\').join('/')
      if (rel.startsWith('test/') || rel.startsWith('scripts/') || rel.startsWith('examples/')) continue
      if (!/\.(m?js)$/.test(rel)) continue
      if (!existsSync(abs)) continue

      // 偏移 → 行号：预先算好每个换行的位置
      const source = readFileSync(abs, 'utf8')
      const lineStarts = [0]
      for (let i = 0; i < source.length; i += 1) if (source[i] === '\n') lineStarts.push(i + 1)
      const lineOf = (offset) => {
        let lo = 0
        let hi = lineStarts.length - 1
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1
          if (lineStarts[mid] <= offset) lo = mid
          else hi = mid - 1
        }
        return lo + 1
      }

      // 【两层语义，别搞混】
      //   ① 单进程内：V8 的区间是嵌套且有序的（父区间在前，细分出的子区间在后），
      //      所以必须"后面的覆盖前面的"，否则顶层那个"整个文件 count=1"会染成假 100%。
      //   ② 跨进程：同一个文件会被多个测试进程加载，每个进程只跑一部分。
      //      这里必须是**并集**（任一方覆盖即覆盖），否则最后处理的那个进程
      //      （往往覆盖最少）会把前面全部抹掉 —— 实测把 79% 抹成了 35%。
      const local = new Map()
      for (const fn of script.functions || []) {
        for (const range of fn.ranges || []) {
          const startLine = lineOf(range.startOffset)
          const endLine = lineOf(Math.max(range.startOffset, range.endOffset - 1))
          for (let line = startLine; line <= endLine; line += 1) {
            local.set(line, range.count > 0)
          }
        }
      }
      const map = perFile.get(rel) || new Map()
      for (const [line, hit] of local) {
        map.set(line, (map.get(line) || false) || hit)
      }
      perFile.set(rel, map)
    }
  }

  // ---- 汇总 ----
  const rows = []
  for (const [rel, map] of [...perFile.entries()].sort()) {
    const total = map.size
    let covered = 0
    for (const hit of map.values()) if (hit) covered += 1
    rows.push({ file: rel, covered, total, pct: total === 0 ? 0 : (covered / total) * 100 })
  }

  const sumCovered = rows.reduce((s, r) => s + r.covered, 0)
  const sumTotal = rows.reduce((s, r) => s + r.total, 0)
  const overall = sumTotal === 0 ? 0 : (sumCovered / sumTotal) * 100

  if (asJson) {
    console.log(JSON.stringify({ overall: Number(overall.toFixed(2)), files: rows, failed: failures }, null, 2))
  } else {
    console.log('\n按文件：')
    console.log('文件'.padEnd(30), '已覆盖/可执行', '  百分比')
    console.log('-'.repeat(58))
    for (const r of rows) {
      const bar = '█'.repeat(Math.round(r.pct / 5)).padEnd(20, '·')
      console.log(`${r.file.padEnd(30)} ${String(r.covered).padStart(5)}/${String(r.total).padEnd(5)} ${r.pct.toFixed(1).padStart(5)}%  ${bar}`)
    }
    console.log('-'.repeat(58))
    console.log(`总覆盖率: ${overall.toFixed(2)}%  （${sumCovered}/${sumTotal} 行）`)
    if (failures.length > 0) console.log(`\n⚠ 以下套件执行失败（覆盖率数据可能不全）: ${failures.join(', ')}`)
  }

  if (minPct !== null && Number.isFinite(minPct) && overall < minPct) {
    console.error(`\n✘ 覆盖率 ${overall.toFixed(2)}% 低于阈值 ${minPct}%`)
    process.exitCode = 1
  }
  if (failures.length > 0) process.exitCode = 1
} finally {
  rmSync(covDir, { recursive: true, force: true })
}
