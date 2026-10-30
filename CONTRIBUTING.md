# 贡献指南

## 先跑起来（零依赖，不需要 npm install）

```bash
node test/router.test.mjs     # 路由 + 集成（177）
node test/guard.test.mjs      # 熔断（21）
node test/probe.test.mjs      # 探针（31）
node test/fuzz.test.mjs       # 模糊测试（12 项 / 约 8400 个随机输入）
node scripts/lint.mjs         # 仓库自检（编码、结构、体积）
```

四个都必须是绿的，本地绿了 CI 基本也会绿（CI 跑 3 平台 × 2 个 Node 版本）。

## 提交前自查

1. **测试先写，再改代码。** 这个仓库的历史里有 4 次"测试失败其实是行为变更"——
   先看测试为什么红，再决定是改测试还是改代码。
2. **碰中文就用编辑器，别用 PowerShell 做文本替换。**
   我们被这个坑过两次：UTF-8 被当 GBK 读写 → 乱码 + BOM → `SyntaxError`。
   `node scripts/lint.mjs` 会拦住它，但最好一开始就别踩。
3. **对外数字必须可复现。** README / CHANGELOG 里每个数字都得能由 `_tools/` 下的脚本重算出来。
   测不出来就写"未验证"，不许估。
4. **改版本号用** `node scripts/bump.mjs 1.10.0`，别手改——手改会漏（漏过一次 README 标题）。

## 架构约定（PR 会被按这个审）

- 能写成纯函数的一律放 `lib/`；`index.js` 只做装配 + 持有会话状态。
- **会话状态必须按 `agent.id` 隔离**，任何跨会话共享的可变状态都是 bug。
- catch 分支只能是"放行 / 降级"，不允许"拦"。
- `ALWAYS_ALLOW` 里的工具永远不可被裁剪（逃生门）。
- 尾部提示 ≤ 200 字，且**只列可用组**（列禁止组会被截断误导模型，实测过）。

细节见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 加一个工具

1. 在 `lib/` 里写好纯逻辑 + 单元测试；
2. 在 `index.js` 里 `ctx.tools.register({...})`；
3. 把它加进 `lib/classify.js` 的 `ALWAYS_ALLOW`（如果是诊断/逃生类工具）；
4. 在 README 的工具表里补一行。

## 加一套领域示例

放 `examples/<name>.json`，然后 `node scripts/lint.mjs` 会确认它被 `package.json` 的
`files` 覆盖到；用 `route_init({"preset":"<name>"})` 就能测。
