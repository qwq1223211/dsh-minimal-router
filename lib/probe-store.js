/**
 * ============================================================================
 * dsh-cache-probe · lib/store.js
 * ============================================================================
 * 只负责一件事：把记录一行一条存到本地 JSONL，并且永远不因为 IO 失败而影响主流程。
 *
 * 为什么用 JSONL 而不是 SQLite/一个大 JSON：
 *   · 追加一行 = appendFile 一行，不需要读整个文件，几乎零成本
 *   · 中途崩了也只丢最后一行，前面的数据照样能读
 *   · 你随时可以用记事本打开看
 * ============================================================================
 */

import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** 【修改这里】数据文件超过这个大小就轮转成 .1（防止无限增长） */
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024

/**
 * @param {{file:string, maxBytes?:number}} options
 */
export function createStore(options = {}) {
  const file = typeof options.file === 'string' && options.file ? options.file : ''
  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : DEFAULT_MAX_BYTES
  let appends = 0
  let failed = false

  async function ensureDir() {
    const dir = dirname(file)
    if (dir && dir !== '.') await mkdir(dir, { recursive: true })
  }

  /** 追加一条记录。失败只记 failed 标记，绝不往外抛。 */
  async function append(record) {
    if (!file) return false
    try {
      await ensureDir()
      await appendFile(file, `${JSON.stringify(record)}\n`, 'utf8')
      appends += 1
      // 每 50 次才 stat 一次，避免频繁系统调用
      if (appends % 50 === 0) await rotateIfNeeded()
      return true
    } catch {
      failed = true
      return false
    }
  }

  /** 文件太大就整体挪到 .1（覆盖旧的 .1），保证最新数据永远在主文件里。 */
  async function rotateIfNeeded() {
    try {
      const info = await stat(file)
      if (info.size <= maxBytes) return false
      const { rename } = await import('node:fs/promises')
      await rename(file, `${file}.1`)
      return true
    } catch {
      return false
    }
  }

  /**
   * 从某个文件尾部读最多 take 条合法记录。
   * 抽出来是因为要能同时读「当前文件」和「轮转文件（.1）」。
   */
  async function tailRecords(path, take) {
    if (!path || take <= 0) return []
    try {
      const text = await readFile(path, 'utf8')
      const lines = text.split('\n').filter((line) => line.trim().length > 0)
      // 【要点】从后往前数「合法记录」，坏行不占名额。
      // 否则「要最近 2 条」碰上末尾一行垃圾，只会给你 1 条。
      const records = []
      for (let i = lines.length - 1; i >= 0 && records.length < take; i -= 1) {
        try {
          const parsed = JSON.parse(lines[i])
          if (parsed && typeof parsed === 'object') records.push(parsed)
        } catch {
          // 坏行直接跳过，不让一行坏数据毁掉整个报告
        }
      }
      records.reverse()
      return records
    } catch {
      return []
    }
  }

  /**
   * 读最后 limit 条。
   *
   * 【v1.19.9】当前文件不够时，自动去读轮转文件 `usage.jsonl.1`。
   * 实测：`.1` 里躺着 2.1 MB 历史，只读当前文件会让"跨会话趋势"直接断掉。
   */
  async function read(limit = 50) {
    if (!file) return []
    const take = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50
    const current = await tailRecords(file, take)
    if (current.length >= take) return current
    const rotated = await tailRecords(`${file}.1`, take - current.length)
    return [...rotated, ...current]
  }

  /** 统计总条数（只数行，不解析）。当前文件 + 轮转文件。 */
  async function count() {
    if (!file) return 0
    let total = 0
    for (const path of [file, `${file}.1`]) {
      try {
        const text = await readFile(path, 'utf8')
        total += text.split('\n').filter((line) => line.trim().length > 0).length
      } catch {
        // 文件不存在就跳过
      }
    }
    return total
  }

  /** 清空（做对照实验时用）。 */
  async function clear() {
    if (!file) return false
    try {
      await ensureDir()
      await writeFile(file, '', 'utf8')
      return true
    } catch {
      return false
    }
  }

  return {
    file,
    maxBytes,
    append,
    read,
    count,
    clear,
    get hasFailed() {
      return failed
    },
  }
}
