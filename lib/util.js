/**
 * ============================================================================
 * dsh-minimal-router · lib/util.js
 * ============================================================================
 * 纯函数与路径常量。
 *
 * 为什么单独拆出来：
 *   1. index.js 有"1200 行守卫线"（scripts/lint.mjs），到线必须拆
 *   2. 这些函数不依赖 Cordis 上下文，拆出去更好测
 * ============================================================================
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 工具的 output 声明（DSH 强制要求 { schema, render }）。
 * 【为什么放这里】index.js 有 1200 行守卫线，这类纯常量搬出来能腾行；
 * 各 lib 模块本来也各自复制了一份，从 util 导入可去重。
 */
export const RENDER = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

/**
 * 数字兜底：NaN / 字符串 / undefined 一律变 0。
 * 【为什么放这里】同上，纯函数，和 index.js 的装配逻辑无关。
 * @param {unknown} value
 * @returns {number}
 */
export function toNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * 【运行时数据目录】必须放在包外面。
 *
 * 为什么：用 `dsh plugin add github:...` 安装时，包会被 pnpm 放进
 * `node_modules/.pnpm/<hash>/`，那是个**会被重装整体替换**的虚拟目录，
 * 升级一次数据就没了，也可能根本没有写权限。
 * link 安装（本地目录）看不出这个问题——所以这个坑只在"别人装了"的时候才炸。
 */
export const STATE_DIR = join(homedir(), '.dsh', 'minimal-router')

/** 收集参数里所有长得像文本的值（有界递归，绝不无限展开）。 */
export function collectStrings(value, options = {}) {
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 4
  const maxChars = Number.isFinite(options.maxChars) ? options.maxChars : 200000
  const out = []
  let budget = maxChars

  function walk(node, depth) {
    if (budget <= 0 || depth > maxDepth) return
    if (typeof node === 'string') {
      if (node.length === 0) return
      const take = node.slice(0, budget)
      budget -= take.length
      out.push(take)
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }
    if (node && typeof node === 'object') {
      for (const item of Object.values(node)) walk(item, depth + 1)
    }
  }

  walk(value, 0)
  return out
}

/**
 * 决定探针数据文件的位置（纯函数，好测）。
 *
 * 【坑】别写成 `{ dataFile: 计算值, ...cfg.probe }` —— 配置里 `dataFile: ''`
 * 会把算好的路径覆盖成空串，然后探针就回退到包目录里去了（实测踩过）。
 *
 * @param {{dataFile?:string}} probeConfig
 * @param {string} [stateDir]
 * @returns {string}
 */
export function pickProbeDataFile(probeConfig = {}, stateDir = STATE_DIR) {
  const explicit =
    probeConfig && typeof probeConfig.dataFile === 'string' ? probeConfig.dataFile.trim() : ''
  return explicit || join(stateDir, 'usage.jsonl')
}
