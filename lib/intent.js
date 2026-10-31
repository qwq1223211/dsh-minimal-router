/**
 * ============================================================================
 * dsh-minimal-router · lib/intent.js
 * ============================================================================
 * 「语义打分路由」——关键词命不中时的第二双眼睛。
 *
 * 【为什么需要它】
 *   detectStage 是硬匹配：没出现 "界面/按钮" 就认不出"把那个按钮挪一下"。
 *   于是用户说了明确意图，阶段却还停在 auto，工具一个都没瘦。
 *
 * 【为什么不能用模型】
 *   每轮额外发一次请求 = 整段上下文全价重发。
 *   省的是便宜 token，花的是全价请求 —— 净亏。所以这里只用**本地字符统计**。
 *
 * 【算法】向量空间里的余弦思路，但用"加权词袋"近似：
 *   1. 给每个阶段建一份"画像"：阶段名 / 标题 / keywords / allow 里的组名
 *   2. 把用户这句话切成 token（CJK 用二元组，拉丁用单词）
 *   3. 命中画像里的 token 就加分（keywords 权重最高，组名次之）
 *   4. 按画像大小归一化，取最高分；**领先不够就不猜**
 *
 * 【安全】返回 null 表示"不敢判断"，调用方会退回"粘住当前阶段"。
 *   宁可不动，也不能因为猜错而付一次全量重建。
 * ============================================================================
 */

const CJK = /[\u4e00-\u9fff]/

/** 把文本切成 token：拉丁词 + CJK 二元组 */
export function tokenize(text) {
  const s = String(text || '').toLowerCase()
  const counts = new Map()
  const add = (t, n = 1) => {
    if (!t) return
    counts.set(t, (counts.get(t) || 0) + n)
  }

  for (const m of s.matchAll(/[a-z][a-z0-9_-]{1,}/g)) add(m[0])

  const chars = [...s].filter((ch) => CJK.test(ch))
  for (let i = 0; i < chars.length - 1; i += 1) {
    add(chars[i] + chars[i + 1])
  }
  // 单字也留一点权重（短句、专有名词）
  for (const ch of chars) add(ch, 0.2)

  return counts
}

/**
 * 给每个阶段建画像。
 *
 * @param {Record<string, {title?:string, allow?:string[], keywords?:string[]}>} stages
 * @returns {Map<string, {weights: Map<string, number>, mass: number}>}
 */
export function buildProfiles(stages) {
  const profiles = new Map()
  const table = stages && typeof stages === 'object' ? stages : {}

  for (const [name, def] of Object.entries(table)) {
    if (name === 'auto') continue // auto = 不限制，不该被"猜"进来
    const weights = new Map()
    const bump = (text, w) => {
      for (const [tok, n] of tokenize(text)) {
        const cur = weights.get(tok) || 0
        weights.set(tok, Math.max(cur, w * Math.min(n, 2)))
      }
    }

    bump(name, 3)
    if (def && typeof def.title === 'string') bump(def.title, 3)
    if (def && Array.isArray(def.keywords)) for (const k of def.keywords) bump(k, 3.5)
    if (def && Array.isArray(def.allow)) for (const tag of def.allow) bump(tag, 2)

    let mass = 0
    for (const w of weights.values()) mass += w
    profiles.set(name, { weights, mass: Math.sqrt(Math.max(mass, 1)) })
  }
  return profiles
}

/**
 * 算一句文本对各阶段的匹配分。
 *
 * @returns {{stage:string, score:number, margin:number, second:string, secondScore:number}|null}
 */
export function scoreText(text, profiles, options = {}) {
  const minScore = Number.isFinite(options.minScore) ? options.minScore : 2.4
  const minMargin = Number.isFinite(options.minMargin) ? options.minMargin : 0.28
  const minChars = Number.isFinite(options.minChars) ? options.minChars : 4
  // 【多领域】第二名达到第一名的这个比例（且自己够格）→ 两个一起放开
  const unionRatio = Number.isFinite(options.unionRatio) ? options.unionRatio : 0.8
  // 【多领域·绝对强度】第二名自己的分够高（= minScore 的 3 倍）→ 它是真领域，不是噪音
  const unionMinAbsolute = Number.isFinite(options.unionMinAbsolute)
    ? options.unionMinAbsolute
    : minScore * 3
  // 【多领域·上限】第一名没把第二名压得太死（margin < 这个值）才取并集
  const unionMaxMargin = Number.isFinite(options.unionMaxMargin) ? options.unionMaxMargin : 0.55

  const raw = String(text || '').trim()
  if (raw.length < minChars) return null
  const toks = tokenize(raw)
  if (toks.size === 0) return null

  const ranked = []
  for (const [stage, prof] of profiles.entries()) {
    let score = 0
    for (const [tok] of toks) {
      const w = prof.weights.get(tok)
      if (w) score += w
    }
    // 画像越大，偶然命中的概率越高 → 用平方根轻微打折，但别压死信号
    ranked.push({ stage, score: score / Math.sqrt(Math.max(prof.mass, 1) / 10) })
  }
  ranked.sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const second = ranked[1] || { stage: '', score: 0 }
  if (!best || best.score < minScore) return null

  const margin = (best.score - second.score) / Math.max(best.score, 1e-6)

  // ---------------------------------------------------------------------------
  // 【本次核心改动】以前 margin 不够就 return null（"什么都不做"）。现在四种情况：
  //
  //   ① 第二名**本身够强**（≥ minScore×3），且第一名没压倒它（margin < 0.55）
  //      → 真·跨领域，取并集
  //        为什么用绝对强度而不是只看 margin：
  //        "写个 Python 脚本爬网页，再整理成周报" 里文档侧 22.7、代码侧 15.4，
  //        margin 有 32%（超过 0.28 阈值），按老规则只会判成单领域 ——
  //        但 15.4 分根本不是噪音，那是实打实的第二个领域。
  //
  //   ② 领先明显（margin ≥ minMargin）且第二名不构成独立领域 → 单领域
  //   ③ 领先不明显，但第二名也够格 → 并集
  //   ④ 第二名太弱/太近 → 放弃（"帮我搞一下"这种就别猜了）
  // ---------------------------------------------------------------------------
  const strongSecond = Boolean(second.stage) && second.score >= unionMinAbsolute
  const notOverwhelming = margin < unionMaxMargin
  const weakButQualified =
    Boolean(second.stage) && second.score >= best.score * unionRatio && second.score >= minScore * 0.8

  let stages
  let reason
  if (strongSecond && notOverwhelming) {
    stages = [best.stage, second.stage]
    reason = 'union-strong-second'
  } else if (margin >= minMargin) {
    stages = [best.stage]
    reason = 'clear'
  } else if (weakButQualified) {
    stages = [best.stage, second.stage]
    reason = 'union-ambiguous'
  } else {
    return null
  }

  return {
    // 仍然给一个 string —— 调用方（index.js）拿到的类型没变
    stage: stages.join('+'),
    stages,
    reason,
    score: Number(best.score.toFixed(3)),
    margin: Number(margin.toFixed(3)),
    second: second.stage,
    secondScore: Number(second.score.toFixed(3)),
  }
}

/**
 * 造一个可复用的检测器（画像只建一次）。
 *
 * @param {object} stages
 * @param {{minScore?:number, minMargin?:number, minChars?:number}} [options]
 */
export function createIntentDetector(stages, options = {}) {
  const profiles = buildProfiles(stages)
  const opts = {
    minScore: options.minScore,
    minMargin: options.minMargin,
    minChars: options.minChars,
    unionRatio: options.unionRatio,
  }
  const detect = (text) => {
    if (profiles.size === 0) return null
    return scoreText(text, profiles, opts)
  }
  /**
   * 宽松探针：只用来生成"建议"，不触发切换。
   * 门槛打到正式判定的 55%，领先幅度也放宽 —— 宁可多提示一句，也不乱切。
   */
  detect.probe = (text) => {
    if (profiles.size === 0) return null
    return scoreText(text, profiles, {
      ...opts,
      minScore: (Number.isFinite(opts.minScore) ? opts.minScore : 2.0) * 0.55,
      minMargin: 0.1,
    })
  }
  return detect
}
