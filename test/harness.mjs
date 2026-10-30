/**
 * 极简测试脚手架（零依赖）。
 *
 * 抽出来是因为现在有 4 个测试文件了，各抄一份 harness 迟早会漂移。
 * 输出格式和原来完全一致，CI 里的 grep 不需要改。
 */
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0
const failures = []
const startedAt = Date.now()

export async function test(title, fn) {
  try {
    await fn()
    passed += 1
    console.log(`${GREEN}\u2714 PASS${RESET}  ${DIM}${String(passed + failed).padStart(2, '0')}${RESET}  ${title}`)
  } catch (error) {
    failed += 1
    failures.push({ title, error })
    console.log(`${RED}\u2716 FAIL${RESET}  ${DIM}${String(passed + failed).padStart(2, '0')}${RESET}  ${title}`)
    console.log(`      ${RED}${error && error.message ? error.message : String(error)}${RESET}`)
  }
}

export function assert(cond, message) {
  if (!cond) throw new Error(message || '断言失败')
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || '值不相等'}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  }
}

/** 打印汇总并按失败数退出 */
export function run() {
  const elapsed = Date.now() - startedAt
  console.log('')
  console.log('============================================================')
  if (failed === 0) {
    console.log(`${GREEN}${BOLD}  \u2705 ALL ${passed} TESTS PASSED${RESET}  ${DIM}(${elapsed}ms / 0 failed)${RESET}`)
    console.log('============================================================\n')
    process.exit(0)
  }
  console.log(`${RED}${BOLD}  \u274c ${failed} FAILED / ${passed} PASSED${RESET}  ${DIM}(${elapsed}ms)${RESET}`)
  console.log('============================================================')
  for (const f of failures) {
    console.log(`${RED}- ${f.title}${RESET}`)
    console.log(`  ${f.error && f.error.stack ? f.error.stack.split('\n').slice(0, 3).join('\n  ') : String(f.error)}`)
  }
  console.log('')
  process.exit(1)
}
