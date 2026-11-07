/**
 * ============================================================================
 * dsh-minimal-router · lib/lint.js
 * ============================================================================
 * 「本地体检」：在代码被写进文件之前，用本地规则扫一遍。
 *
 * 三条铁血规则（会拦，但只拦"执行型"工具）：
 *   · 循环条件恒为真的 while 写法，且体内没有 break/return/throw
 *   · 条件为空的 for 写法（两个分号之间什么都不写），同上
 *   · 先 do 后判恒为真的写法，同上
 *
 * 【按工具分级 · v1.19.6】内容型工具（write / edit）只警告不拦，见 LINT_WARN_TOOLS。
 * 原因：它们的参数是**文件内容**，不是要执行的命令；把写入内容里的循环判死是误拦。
 * 真正执行的是 pwsh / terminal / python，它们仍然 deny。
 * 注：本注释刻意不写字面模式，避免以后改这个文件时被自己的规则拦住。
 *
 * 一条软规则（只警告，不拦）：
 *   · 函数体里直接调用自己，且体内没有 if/return/throw  → "疑似无终止递归"
 *
 * 为什么软规则不拦：正则/AST 都没法证明"递归一定会终止"。宁可提示，
 * 也不能因为它误判就把你正常写的递归函数拦死。
 *
 * 为什么要先"去噪"：
 *   代码里经常出现 `console.log("while(true)")` 或 `// while(true) 不要这么写`。
 *   直接正则匹配就是误杀。所以先把注释和字符串整体抹掉，再做匹配。
 *   抹掉字符串时保留 `""` 占位，避免把前后 token 粘在一起。
 * ============================================================================
 */

/** 【修改这里】扫描的字节上限（防止超大文件把事件循环拖住） */
export const SCAN_LIMIT = 400 * 1024

import { collectStrings } from './util.js'

/**
 * 默认"只警告不拦"的工具：它们的参数就是**文件内容**，不是要执行的命令。
 *
 * 为什么必须有这个分级：
 *   `write` / `edit` 一旦被当成"要执行的代码"来拦，写一个合法的无限循环
 *   （游戏主循环、守护进程、事件循环）就会被拒。实测这会在一次长会话里
 *   误拦几十次写入，而真正要执行的是 `pwsh` / `terminal` / `python`。
 *   所以内容型工具降级为 warn：照常写，只在控制台提示一句。
 */
export const LINT_WARN_TOOLS = Object.freeze(['write', 'edit'])

/** 【修改这里】循环体里的"合法出口"关键字 */
const EXIT_KEYWORDS = /\b(?:break|return|throw)\b/

/**
 * 去掉注释和字符串内容，保留代码骨架。
 * 支持 // 行注释、块注释、单引号、双引号、模板字符串（含转义）。
 * @param {string} code
 * @returns {string}
 */
export function stripNoise(code) {
  const s = typeof code === 'string' ? code.slice(0, SCAN_LIMIT) : ''
  let out = ''
  let i = 0
  let mode = 'code'
  while (i < s.length) {
    const c = s[i]
    const next = s[i + 1]
    if (mode === 'code') {
      if (c === '/' && next === '/') {
        mode = 'line'
        i += 2
        continue
      }
      if (c === '/' && next === '*') {
        mode = 'block'
        i += 2
        continue
      }
      if (c === "'" || c === '"' || c === '`') {
        mode = c === "'" ? 'single' : c === '"' ? 'double' : 'template'
        out += '""'
        i += 1
        continue
      }
      out += c
      i += 1
      continue
    }
    if (mode === 'line') {
      if (c === '\n') {
        mode = 'code'
        out += '\n'
      }
      i += 1
      continue
    }
    if (mode === 'block') {
      if (c === '*' && next === '/') {
        mode = 'code'
        i += 2
      } else {
        i += 1
      }
      continue
    }
    // 三种字符串状态
    if (c === '\\') {
      i += 2
      continue
    }
    const closer = mode === 'single' ? "'" : mode === 'double' ? '"' : '`'
    if (c === closer) mode = 'code'
    i += 1
  }
  return out
}

/**
 * 从 openIndex 处的 { 开始，找到配对 } 的下标。
 * @param {string} code
 * @param {number} openIndex
 * @returns {number} 配对的 } 下标；找不到返回 -1
 */
export function matchBrace(code, openIndex) {
  let depth = 0
  for (let i = openIndex; i < code.length; i += 1) {
    const c = code[i]
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** 用下标算行号（1 起），给报错定位用。 */
export function lineAt(code, index) {
  let line = 1
  for (let i = 0; i < index && i < code.length; i += 1) if (code[i] === '\n') line += 1
  return line
}

/** 抓出错位置所在的那一行原文（用于报错提示）。 */
function snippetAt(code, index) {
  const start = code.lastIndexOf('\n', Math.max(0, index - 1)) + 1
  let end = code.indexOf('\n', index)
  if (end < 0) end = code.length
  return code.slice(start, end).trim().slice(0, 100)
}

/**
 * 扫描一段代码。
 * @param {string} code
 * @returns {{findings: Array<{rule:string, severity:'block'|'warn', line:number, snippet:string, message:string}>}}
 */
export function scanCode(code) {
  const raw = typeof code === 'string' ? code.slice(0, SCAN_LIMIT) : ''
  if (!raw) return { findings: [] }
  const clean = stripNoise(raw)
  const findings = []

  // ---------------- 规则 1：死循环 ----------------
  // 同时覆盖 JS 的 while(true|1) 和 PowerShell 的 while ($true)
  const loopPatterns = [
    { rule: 'while-true', re: /\bwhile\s*\(\s*(?:true|1|\$true)\s*\)/gi, label: 'while(true)' },
    { rule: 'for-empty', re: /\bfor\s*\(\s*;\s*;\s*\)/g, label: 'for(;;)' },
  ]
  for (const { rule, re, label } of loopPatterns) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(clean)) !== null) {
      const afterParen = clean.indexOf(')', match.index)
      const braceIndex = afterParen < 0 ? -1 : clean.indexOf('{', afterParen)
      if (braceIndex < 0) {
        // 没有花括号：单语句循环体，无法证明有出口 → 直接拦
        findings.push({
          rule,
          severity: 'block',
          line: lineAt(clean, match.index),
          snippet: snippetAt(raw, match.index),
          message: `${label} 没有花括号循环体，无法确认退出条件`,
        })
        continue
      }
      const end = matchBrace(clean, braceIndex)
      const body = end > 0 ? clean.slice(braceIndex, end + 1) : clean.slice(braceIndex)
      if (EXIT_KEYWORDS.test(body)) continue // 体内有 break/return/throw → 认为有出口，放行
      findings.push({
        rule,
        severity: 'block',
        line: lineAt(clean, match.index),
        snippet: snippetAt(raw, match.index),
        message: `${label} 的循环体里没有 break / return / throw，会永远转下去`,
      })
    }
  }

  // ---------------- 规则 2：do{}while(true) ----------------
  const doRe = /\bdo\s*\{/g
  doRe.lastIndex = 0
  let doMatch
  while ((doMatch = doRe.exec(clean)) !== null) {
    const open = clean.indexOf('{', doMatch.index)
    const close = matchBrace(clean, open)
    if (close < 0) continue
    const after = clean.slice(close + 1)
    if (!/^\s*while\s*\(\s*(?:true|1|\$true)\s*\)/i.test(after)) continue
    const body = clean.slice(open, close + 1)
    if (EXIT_KEYWORDS.test(body)) continue
    findings.push({
      rule: 'do-while-true',
      severity: 'block',
      line: lineAt(clean, doMatch.index),
      snippet: snippetAt(raw, doMatch.index),
      message: 'do{}while(true) 的循环体里没有 break / return / throw',
    })
  }

  // ---------------- 规则 3：无终止递归（只警告） ----------------
  const fnRe = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g
  fnRe.lastIndex = 0
  let fnMatch
  while ((fnMatch = fnRe.exec(clean)) !== null) {
    const name = fnMatch[1]
    const open = clean.indexOf('{', fnMatch.index)
    if (open < 0) continue
    const close = matchBrace(clean, open)
    if (close < 0) continue
    const body = clean.slice(open, close + 1)
    // 把定义那一行挖掉，再看还有没有同名调用
    const callRe = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`, 'g')
    const occurrences = (body.match(callRe) || []).length
    if (occurrences === 0) continue
    // 【要点】这里只认"条件/异常"作为终止迹象。
    // 不能把 return 算进去：`return again(n)` 是典型的尾调用，它不是终止条件。
    // 一个递归函数体内连 if/switch/throw 都没有，就几乎不可能有基线情况。
    if (/\b(?:if|throw|switch|catch)\b/.test(body)) continue
    findings.push({
      rule: 'unbounded-recursion',
      severity: 'warn',
      line: lineAt(clean, fnMatch.index),
      snippet: snippetAt(raw, fnMatch.index),
      message: `函数 ${name} 直接调用自己，体内又没有任何 if/return/throw，疑似无终止递归`,
    })
  }

  return { findings }
}

/**
 * 把发现的问题合成一句祈使句（给模型看的）。
 * @param {Array<{rule:string,severity:string,line:number,snippet:string,message:string}>} findings
 * @param {string} where 被扫的是哪个工具/哪个参数
 * @returns {string}
 */
export function formatFindings(findings, where = '') {
  const list = Array.isArray(findings) ? findings : []
  if (list.length === 0) return ''
  // 【i18n】这段会作为工具错误返回给模型，所以用英文。
  const lines = [`[local lint] blocked${where ? ` on ${where}` : ''} — ${list.length} high-risk pattern(s):`]
  for (const f of list.slice(0, 5)) {
    lines.push(`line ${f.line}: ${f.message}`)
    if (f.snippet) lines.push(`  code: ${f.snippet}`)
  }
  lines.push(
    'Rewrite that code before retrying: give the loop an explicit exit condition (e.g. `while (running)` with `running` updated inside), or end it with `break`.',
  )
  return lines.join('\n')
}

/**
 * 统一的体检决策：allow / warn / deny。
 *
 * 把"要不要拦"从 index.js 里搬出来，好处是两个都可以单独测：
 *   · index.js 只负责"拿到决策 → 记日志 / 返回 deny / 打印告警"
 *   · 本函数可以用任意工具名组合单测，不需要起插件
 *
 * 分级规则（这是本次重构的核心）：
 *   执行型工具（pwsh / terminal / python…）→ 命中即 deny
 *   内容型工具（write / edit，见 LINT_WARN_TOOLS）→ 只 warn，照常写入
 *   逃逸名单（skipTools）→ 整段跳过，连扫都不扫
 *
 * @param {{toolName?:string, args?:unknown, mode?:string, skipTools?:Iterable<string>, warnTools?:Iterable<string>, minScanChars?:number, maxArgChars?:number}} input
 * @returns {{action:'allow'|'warn'|'deny', reason:string, code?:string}}
 */
export function decideLint(input = {}) {
  const toolName = typeof input.toolName === 'string' ? input.toolName : ''
  const mode = input.mode === 'warn' || input.mode === 'off' ? input.mode : 'deny'
  if (mode === 'off' || !toolName) return { action: 'allow', reason: '' }
  const skip = input.skipTools instanceof Set ? input.skipTools : new Set(input.skipTools || [])
  if (skip.has(toolName)) return { action: 'allow', reason: '' }
  const warnTools = input.warnTools instanceof Set ? input.warnTools : new Set(input.warnTools || [])
  const minChars = Number.isFinite(input.minScanChars) ? input.minScanChars : 8
  const texts = collectStrings(input.args, { maxChars: input.maxArgChars })
  for (const text of texts) {
    if (typeof text !== 'string' || text.length < minChars) continue
    const { findings } = scanCode(text)
    const blocks = findings.filter((f) => f.severity === 'block')
    if (blocks.length === 0) continue
    const reason = formatFindings(blocks, `工具 ${toolName}`)
    if (mode === 'warn' || warnTools.has(toolName)) return { action: 'warn', reason }
    return { action: 'deny', reason, code: 'LINT_DEAD_LOOP' }
  }
  return { action: 'allow', reason: '' }
}
