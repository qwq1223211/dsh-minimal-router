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

## 包名为什么是 `@local/dsh-minimal-router`

不是随手起的，也不是"没发布"的意思：

- **`@local/` 是本地 link bundle 的约定命名空间**。同一台机器上其他本地包
  （`cursor-plugin-demo`、`self-adapt`、整套 `unity-*` 共 18 个）都用这个前缀，合计 24 个。
  单独把某个包改成无前缀名，会让 `dsh.profile.bundles` 里出现一个异类。
- **`private: true` 是故意的**：防止 `npm publish` 手滑把内部包发出去。

### 如果你要真正发布到 npm

包名这一处要改，而且会级联，所以写清楚：

1. `package.json` → `"name": "@<你的scope>/dsh-minimal-router"`，按需去掉 `private`
2. **`cordis.patch.yml` 里的 `name:` 必须同步改**（否则 bundle 解析不到模块）
3. 已安装用户的 profile：`dependencies` 的 key 与 `dsh.profile.bundles` 的条目都要换名，然后重装。
   **对已装用户是 breaking change——越早改越便宜。**

## 依赖与入口：这一类 bug 有共同的伪装

它们**在本机 link 安装时 100% 正常**，只在别人机器上炸，而且常常不报错、只是"没效果"。

```bash
node scripts/audit-deps.mjs           # 7 项体检，失败退出码 1
node test/install-elsewhere.test.mjs  # 只按 files 复制一份，从"安装目录"里跑
```

| 检查项 | 它防止哪种事故 |
|---|---|
| 零外部依赖 / `main` 与 `exports` 一致 | 别人装上去 `cannot find module` |
| **`files` 是否覆盖"运行时真正 import 的文件"**（递归解析 import 图） | 少列一个 `lib/*.js`，装上去就崩 |
| `inject` 不含 `systemPrompt` | 缺这个服务的宿主让**整个插件**加载失败 |
| `engines.dsh` 合法（含**空串陷阱**） | 空字符串会被 DSH 判为不满足 → 直接拦装 |
| 写盘路径在包外 / 无写操作指向包内 | pnpm store 里包目录可能只读，写入必失败 |
| `install-elsewhere` 全套 | 以上任何一条漏了，这个测试会红 |

### 本机**验证不了**的三件事（别在 PR 里声称验证过）

1. **DSH loader 如何解析 `cordis.patch.yml`** —— 逻辑在打包后的 `app.asar` 里。
   我们能读源码（`_tools/inspect-asar.mjs`）但不能执行它。
2. **`tools.restrict()` / `systemPrompt.context()` 的真实语义** —— 需要一个活着的宿主。
   测试里的假宿主只保证"我们调用它的方式"是对的，不保证宿主行为。
3. **pnpm 真装一次之后包落在哪、可不可写** —— 需要网络 + 一次真实 `dsh plugin add`。

**这三件事只有"装到一台干净机器上跑一遍"才能确认。** 谁声称验证过，要求他给出步骤。
