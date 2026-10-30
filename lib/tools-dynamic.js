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
      description:
        'Reset this session back to the default stage (auto) and lift every stage restriction. Escape hatch — never blocked.',
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
        'Narrow the tools visible in this session to the named groups (no stage table needed). Keeps only those groups plus base tools; the rest is temporarily removed, then restored on expiry or after route_reset. Pass an empty array to restore everything immediately. Group names come from route_status tagCounts.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          groups: {
            type: 'array',
            items: { type: 'string' },
            description: 'Groups to keep, e.g. ["unity"]; an empty array restores all tools',
          },
          turns: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            description: 'How many turns to keep the narrowing (default 3). Restores automatically — nothing to undo.',
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
        'Turn the tail routing hint on or off for this session at runtime (no reload). Useful for comparing behaviour and cost with and without the hint. Call without arguments to just query the current state.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean', description: 'true = inject the hint, false = do not inject' },
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
