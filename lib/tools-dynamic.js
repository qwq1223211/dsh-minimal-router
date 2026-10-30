/**
 * 三个"轻量动作型"工具：复位 / 按需收窄 / 提示开关。
 *
 * 它们的共同点：**schema 小、逻辑只做一件事、全部依赖注入**。
 * 所以从 index.js 里搬出来最安全——搬的就是"定义 + 参数解析"，
 * 真正的状态操作仍然留在 index.js（用 deps 回调传进来）。
 *
 * 这样 index.js 只负责"装配"，工具定义各自成文件，符合"单一职责"。
 */

/**
 * 注册 route_reset / route_use / route_hint。
 *
 * @param {object} ctx Cordis 上下文
 * @param {object} deps 注入的依赖
 * @param {object} deps.RENDER 工具的 output 渲染器
 * @param {(x:any)=>string} deps.keyOf 取会话 key
 * @param {(key:string, agent:any)=>object} deps.resetSession 复位会话并返回结果
 * @param {(key:string, groups:string[], turns:number, agent:any)=>object} deps.setGrant 收窄
 * @param {(key:string, agent:any)=>object} deps.clearGrant 放开
 * @param {(key:string, enabled:boolean)=>void} deps.setHint 设置提示开关
 * @param {(key:string)=>object} deps.hintState 读取提示状态
 */
export function registerDynamicTools(ctx, deps) {
  const { RENDER, keyOf } = deps

  // -------------------------------------------------------------------------
  // route_reset —— 逃生门（永远放行）
  // -------------------------------------------------------------------------
  ctx.effect(() =>
    ctx.tools.register({
      name: 'route_reset',
      description: '把当前会话的阶段复位成默认值（auto），解除一切阶段拦截。逃生门，永远不被拦截。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: RENDER,
      async execute(_args, exec) {
        return deps.resetSession(keyOf(exec), exec && exec.agent)
      },
    }),
  )

  // -------------------------------------------------------------------------
  // route_use —— 任务驱动的一次性收窄（不需要任何阶段配置）
  //
  // 【为什么要有它】预设阶段要求用户"先知道自己要做什么"。
  // route_use 把这份判断交回给**模型自己**：这一轮需要哪几组，就只要哪几组，
  // 过期自动放开。零配置、可撤销，不依赖任何 custom_stages.json。
  // -------------------------------------------------------------------------
  ctx.effect(() =>
    ctx.tools.register({
      name: 'route_use',
      description:
        '按需收窄当前会话可见的工具组（不需要预设阶段）。只保留指定组 + 基础工具，其余工具被临时摘掉；到期或 route_reset 后自动恢复。传空数组可立即放开。组名见 route_status 的 tagCounts。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          groups: {
            type: 'array',
            items: { type: 'string' },
            description: '要保留的工具组名（如 ["unity"]）；传空数组等于立即放开全部',
          },
          turns: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            description: '保持多少轮（默认 3）。到点自动恢复，不用记着撤销。',
          },
        },
        required: ['groups'],
      },
      output: RENDER,
      async execute(args, exec) {
        const key = keyOf(exec)
        const raw = args && Array.isArray(args.groups) ? args.groups : []
        const groups = raw.filter((g) => typeof g === 'string' && g.trim()).map((g) => g.trim().toLowerCase())
        const turnsRaw = args && Number.isFinite(Number(args.turns)) ? Math.trunc(Number(args.turns)) : 3
        const turns = Math.min(20, Math.max(1, turnsRaw))

        if (groups.length === 0) return deps.clearGrant(key, exec && exec.agent)
        return deps.setGrant(key, groups, turns, exec && exec.agent)
      },
    }),
  )

  // -------------------------------------------------------------------------
  // route_hint —— 运行时开关尾部提示（A/B 实验用）
  // -------------------------------------------------------------------------
  ctx.effect(() =>
    ctx.tools.register({
      name: 'route_hint',
      description:
        '开/关当前会话的尾部路由提示（运行时生效，不用重载）。用于对比"有提示 vs 无提示"的表现与成本。不带参数则只查询当前状态。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean', description: 'true = 注入提示，false = 不注入' },
        },
      },
      output: RENDER,
      async execute(args, exec) {
        const key = keyOf(exec)
        if (args && typeof args.enabled === 'boolean') deps.setHint(key, args.enabled)
        return deps.hintState(key)
      },
    }),
  )
}
