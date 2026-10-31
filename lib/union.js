/**
 * ============================================================================
 * dsh-minimal-router · lib/union.js
 * ============================================================================
 * 「多领域并集」的全部机关都在这个文件里。
 *
 * 【问题】
 *   意图判断器（lib/intent.js）在跨领域句子上，两个阶段分数都够高、margin 不够，
 *   以前只能 return null —— 结果是"什么都不做，粘在当前阶段"。
 *   用户说"写个 Python 脚本爬网页，再整理成周报文档"，插件一个领域都认不出来。
 *
 * 【解法】
 *   1. 判定器返回并集名字符串：`"python-code+document-write"`（仍然是一个 string，
 *      调用方 index.js 完全不用改类型）
 *   2. 用 Proxy 包住阶段表：查 `stages["python-code+document-write"]` 时，
 *      现场合成一个 `{ allow: 两边的并集 }` 的临时阶段定义
 *
 * 【为什么用 Proxy 而不是改 index.js】
 *   index.js 里有 1198 行代码（守卫线 1200），已经一行都塞不进去了。
 *   而它对阶段的所有访问都是 `stages[name]` 这种下标读取
 *   （index.js:377/1017，lib/classify.js:103/134/139/175，lib/prompt.js:30/38）。
 *   Proxy 拦一次，这些地方全部自动生效 —— 零改动。
 * ============================================================================
 */

/** 并集分隔符。选 '+' 是因为它不会出现在合法阶段名里（阶段名用 - 和字母）。 */
export const UNION_SEP = '+'

/**
 * 把 `"a+b"` 拆成 `["a","b"]`；不是并集名就返回 null。
 * @param {string} name
 * @returns {string[]|null}
 */
export function parseUnion(name) {
  if (typeof name !== 'string' || !name.includes(UNION_SEP)) return null
  const parts = name
    .split(UNION_SEP)
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.length >= 2 ? parts : null
}

/**
 * 把若干阶段拼成并集名。
 * @param {string[]} parts
 * @returns {string}
 */
export function unionName(parts) {
  const list = Array.isArray(parts) ? parts.filter((p) => typeof p === 'string' && p) : []
  return list.join(UNION_SEP)
}

/**
 * 合成一个并集阶段的定义。
 * @param {string} name 并集名
 * @param {object} table 原阶段表
 * @returns {object|undefined}
 */
export function synthesizeStage(name, table) {
  const parts = parseUnion(name)
  if (!parts) return undefined
  const usable = parts.filter((part) => table && Object.hasOwn(table, part) && table[part])
  // 一个有效部分都没有 → 当成未知阶段（调用方会走"未知阶段"分支）
  if (usable.length === 0) return undefined
  // 只有一个有效部分 → 直接退回那个真实阶段，别造一个等价替身
  if (usable.length === 1) return table[usable[0]]

  const seen = new Set()
  const allow = []
  for (const part of usable) {
    const list = Array.isArray(table[part].allow) ? table[part].allow : []
    for (const tag of list) {
      const key = typeof tag === 'string' ? tag.toLowerCase() : ''
      if (!key || seen.has(key)) continue
      seen.add(key)
      allow.push(key)
    }
  }

  const titles = usable.map((part) => (table[part] && table[part].title) || part)
  return {
    title: titles.join(' + '),
    allow,
    // 【关键】合成阶段不参与关键词匹配 —— 否则它会被自己的名字反复命中，越滚越大
    keywords: [],
    /** 标记：路由状态面板可以据此显示"这是并集" */
    synthetic: true,
    parts: usable,
  }
}

/**
 * 给阶段表装一层 Proxy，让 `table["a+b"]` 能解析。
 *
 * 注意：
 *   · `Object.keys()` / `JSON.stringify()` 仍然只看真实阶段（不含合成名）
 *   · 合成结果会缓存，避免每次访问都造一个新对象（引用稳定性）
 *
 * @template T
 * @param {T} table
 * @returns {T}
 */
export function withUnion(table) {
  if (!table || typeof table !== 'object') return table
  const cache = new Map()

  return new Proxy(table, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop.includes(UNION_SEP)) {
        if (cache.has(prop)) return cache.get(prop)
        const synthesized = synthesizeStage(prop, target)
        cache.set(prop, synthesized)
        return synthesized
      }
      return Reflect.get(target, prop, receiver)
    },
    has(target, prop) {
      if (typeof prop === 'string' && prop.includes(UNION_SEP)) {
        const synthesized = synthesizeStage(prop, target)
        return Boolean(synthesized)
      }
      return Reflect.has(target, prop)
    },
  })
}
