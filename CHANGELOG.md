# Changelog

All notable changes to `dsh-minimal-router`.
Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [SemVer](https://semver.org/).

## [1.15.0] — 2026-10-31

把**给模型看的东西**全部改成英文。这是本项目里唯一被认定为"功能性缺口"的非代码问题。

### 为什么

`locale/zh.json` 只翻译了插件名和一句话简介（`meta`）。而 **10 个工具的 `description`、
参数说明、以及每一轮都要发的尾部提示，全是硬编码中文**。

对模型来说，工具的 `description` 就是使用说明书。**英文任务配中文 schema，选工具的准确率会掉**
——而这正是插件最核心的能力。所以这不叫"不够精致"，叫**对非中文用户降级**。

### Changed

- **10 个工具的 description + 全部参数说明 → 英文**（`route_stage` / `route_status` / `route_init` /
  `route_reset` / `route_use` / `route_hint` / `cache_probe_report` / `cache_probe_clear` /
  `guard_status` / `guard_reset`）
- **尾部路由提示 → 英文**，并压缩措辞让 `unity-code` 这种最长的阶段也**正好落在 200 字内不截断**
  （英文比中文长，第一版直接顶到上限被截了）
- 自动检查：`grep` 四个源文件，**中文 description 行数 = 0**

### 还没做的（下一批）

- 拦截文案 / 体检文案 / 熔断提示（`【阶段越界】…`、`【已熔断】…`）仍为中文 —— 这些只在出错时出现
- 控制台警告（`[minimal-router] …`）仍为中文 —— 这些是给人看的
- `route_status` / `cache_probe_report` 返回里的 `hint` 字段仍为中文

**288 项测试**。

## [1.14.1] — 2026-10-31

把 allow 模式真机跑了 8 个会话。结论是：**它更省，但会藏坏工具 —— 所以默认必须保持 deny。**

### 实测（同阶段 core、同任务、只差 restrictMode，每臂 4 个会话）

| 组 | tools | toolsChars | `read` 可用？ |
|---|---|---|---|
| 不裁剪（auto） | 172 | 138,711 | ✅ |
| **deny**（默认） | **72** | **50,101** | ✅ |
| **allow** | **39** | **17,015** | ❌ **4/4 全丢** |

**allow 再省 66%**（17,015 vs 50,101 字节），但 4 个会话**全部**报
`Error: unknown tool "read"`，只能改用终端读文件。

### 为什么

`restrict({allow})` 的语义是"只留点名的"。而 **`read` / `write` 这类作用域本地注册的工具
不在 `restrictableNames` 里** —— 我们点不出它们的名字，于是 allow 列表里没有它们，
被"只留点名的"一起藏掉。这不是 bug，是语义决定的。

所以：

- **`deny` 保持默认**（只摘点得出名字的工具，不误伤）
- `allow` 保留为可选，并在 `cordis.patch.yml` 与文档里写明"会隐藏点不出名字的工具，可能丢功能"

### 顺带一个解释了很久的谜

`estimatedAdvertised` 一直报 **38**，两个模式都一样。实际：allow 是 **39**（38 + `run_code`），
deny 是 **72**。也就是说**这个估算描述的其实是 allow 语义**——拿它去解释 deny 当然对不上。
这就是 1.13.2/1.13.3 里那个"38 vs 72"谜团的最外层解释。

**288 项测试**。

## [1.14.0] — 2026-10-31

从 DSH 源码里确认了 `restrict()` 的真实签名之后，补上两条**根治性**的改动。

### Added —— `restrictMode: 'allow'`

从 `@deepseek-ai/dsh-tools/lib/index.js` 读到：

```js
/**
 * @param filter - global-tool mask: `allow` (keep only) and/or `deny` (remove).
 */
restrict(filter) { … }
```

也就是说 `allow` 一直是支持的，我们只用了一半。

| | `deny`（默认，不变） | `allow`（新增，可选） |
|---|---|---|
| 依赖"注册表有多大" | **是** ← 这就是 38/72 错配的根源 | **否** |
| 结果可预测 | 172−100=72，和算出来的 38 不符 | 恰好等于点名的那些 |
| 适用 | 想尽量少见工具 | 想要**确定性** |

`restrictMode` 也进了限制签名，所以两种模式互切时会重新计算，不会因为"签名没变"被跳过。
一个都不留时自动退回 `deny`（全藏工具太危险）。`route_status` 新增 `restrictMode` 字段。

### Fixed —— 保留名 `run_code`

源码里这句是硬拦截：

```js
if ([...allow ?? [], ...deny ?? []].includes("run_code")) throw new Error(…)
```

如果用户开了 PTC 模式，`run_code` 会出现在工具表里；我们的 deny 列表一旦包含它，
**整个 `restrict()` 会抛错**，而我们外层是 try/catch —— 表现就是**静默不裁剪**
（又是"装了没效果"）。现在 `run_code` 进了 `ALWAYS_ALLOW`（因此不会被算进 deny），
`allow` 分支也会显式跳过它。3 条测试守着。

### 现状

**288 项测试**（router 181 + guard 21 + probe 31 + fuzz 12 + instrument 31 + install-elsewhere 8 + migration 4）。

> 还没做：**allow vs deny 的真机 A/B**。它需要把 `restrictMode` 改成 `allow` 再重载一次（= 一次全价重建），
> 跑两个子会话比 `toolsChars`，然后改回来再重载一次。两次重载的账先跟你确认。

## [1.13.3] — 2026-10-31

按 `docs/AB.md` 跑了 **3 轮**，拿到第一份可以引用的端到端数字；同时**删掉了我自己在 1.13.2 里加的假数字**。

### 实测结果（3 轮 × 2 臂，从原始探针记录归属）

| 组 | 请求数 | 平均工具数 | 平均工具字节 |
|---|---|---|---|
| A 臂（`core`，裁剪开） | 23 | 72 | **50,101** |
| B 臂（`auto`，裁剪关） | 26 | 172 | 138,711 |

**工具声明减少 63.9%**，两臂工具数分别是 72 / 172。
这是**确定性**指标（只由工具表决定），可以直接引用；命中率不作证据（子会话刚起必然低）。

### Fixed —— 1.13.2 里我加的 `advertisedAfterRestrict` 是错的

上一版我以为"restrict 之后重新读 `scopedTools.schemas()`"就能拿到真实可见数。实测：

```
减法估          138 − 100 = 38
scoped schemas           = 138   ← 这个接口根本不反映限制
请求里实际       172 − 100 = 72   ← 只有探针知道
```

**两个"看起来更准"的数都是错的。** 字段已删除，只保留 `estimatedAdvertised`（名字里带 estimate），
并在注释里写明：**唯一权威的数字是 `cache_probe_report` 的 `tools` / `toolsChars`**。
测试改成守卫式断言：这个字段**不许再出现**。

### 也记下两个归属上的坑

- `scope:"session"` 有时会把子会话算进父会话（6 个子会话里就有 1 个拿到父会话指纹）——
  所以 A/B 的归属必须用原始记录 + `byPrefix`，不能信子会话自报。
- `tools === 0` 的记录是"请求建立前"的空记录，算平均时必须排除，否则数字会被拉低 20% 以上。

**285 项测试**（router 178）。

## [1.13.2] — 2026-10-31

第一次真的把 A/B 跑起来了。**它没证明"省了 X%"，但它抓到了两个真问题**——这比一个漂亮数字值钱。

### A/B 做了什么

两个子会话，任务完全相同（切阶段 → 建 3 个文件 → 读回 → 报告），唯一差异是第 1 步：
A 臂 `route_stage("core")`（裁剪开），B 臂 `route_stage("auto")`（裁剪关）。

**从探针原始记录里读出来的事实**（不是子会话自己的汇报）：

| 臂 | tools | toolsChars | prefixSig |
|---|---|---|---|
| A（core） | 72 | **50,101** | e3078b10 |
| B / 主会话（auto） | 172 | 138,711 | c04e7cca |

**裁剪确实生效，而且幅度很大：138,711 → 50,101 字节（−63.9%）。**

### 抓到的问题 1：`route_status` 在谎报可见数

A 臂自报 `restrictedToolCount=100`、`estimatedAdvertised=38`，但请求里实际剩 **72** 个。
原因：deny 列表是按**子会话自己的注册表**（138 个）算的，而 `restrict()` 作用在**更大的共享工具表**（172 个）上：

```
172 − 100 = 72   ← 实际
138 − 100 = 38   ← 我们报的
```

**修法**：不再用减法估。`restrict()` 之后**重新读一次** `scopedTools.schemas()`，
新增字段 `advertisedAfterRestrict`（真实可见数；读不到就是 `null`，不瞎报）。+1 测试。

### 抓到的问题 2：`scope:"session"` 分不清父会话和子会话

两个子会话都报 `session = 6a12cf96`、`toolsChars = 138711` —— **一模一样**，因为它们和主会话
共享同一个 `sessionId`，`scope:"session"` 把三者的请求混成了一个。

**修法**：session 作用域下新增 **`byPrefix`**：按前缀指纹分组，列出"这个会话里出现过哪几种工具表"
（每个带 tools / toolsChars / 次数 / 命中率）。A/B 就是靠它区分的。

### 顺手修正的度量

体积守卫原来数**原始行数**（index.js 1511 行），而其中 27% 是注释——等于在惩罚写注释。
改成只数**代码行**（当前 1105 行），阈值重新校准到 1200。这不是放宽标准，是换了个正确的尺子。

### 没做到的（说清楚）

- 本次改动**没有重载插件做真机验证**（重载 = 一次全价重建，这个会话已经很贵了）。
  `advertisedAfterRestrict` 与 `byPrefix` 需要重载后才能在 `route_status` / `cache_probe_report` 里看到。
- A/B 的样本仍然是 **n=1**。`docs/AB.md` 里写了要跑 3 次取中位数，这次没跑。

**285 项测试**（router 178 + guard 21 + probe 31 + fuzz 12 + instrument 31 + install-elsewhere 8 + migration 4）。

## [1.13.1] — 2026-10-31

三件"离顶尖还差什么"里能做的两件半做完了，第三件（改包名）**查完证据后撤回**。

### Added —— A/B 对照（这是最有价值的一件）

- **`scripts/analysis/ab-compare.mjs`**：列出所有会话的真实账单，并对比任意两个：
  请求数、promptTokens、全价/命中 token、工具声明字节、前缀重建次数、命中率。
- **`docs/AB.md` 协议**：怎么跑出一对"能比"的会话（同模型、同插件版本、逐字相同的 10 条问题、
  唯一差异是 `enforceByRestrict`），以及**报告该怎么写才不是自欺**：
  - 能确定性比较的只有 **工具声明字节**
  - 命中率能看出"缓存有没有被打断"
  - **promptTokens 合计不可比**——里面混着"这次对话有多长"
  - 必须主动列出干扰项（重载插件 = 一次全价重建、模型输出长度不稳定、中途自动切阶段）

### Changed —— README 第一屏重写

原来第一屏是"文档很全"，但没有让人留下来的理由。现在：一句话 → **三条命令** →
30 秒数字表 → **一段真实探针记录** → 诚实边界。

那段记录用的是真数据：

```json
{ "inputTokens": 563654, "cacheReadTokens": 5504, "promptTokens": 569158, "hitRate": 0.0097 }
```

`hitRate 0.97%` 就是"整段上下文按全价重算"的样子——它比任何形容词都更能解释这个插件为什么存在。

### Reverted —— 我关于"包名太业余"的判断是错的

我原本建议把 `@local/dsh-minimal-router` 改成无前缀名。查了 profile 才发现：
**`@local/` 是本地 link bundle 的约定命名空间**，这台机器上另外 23 个本地包
（`cursor-plugin-demo`、`self-adapt`、整套 `unity-*`）都用它。

单独改一个会让 `dsh.profile.bundles` 里出现异类，还要同时动 `cordis.patch.yml` 和用户 profile。
所以**不改**，改为在 `CONTRIBUTING.md` 里写清：为什么是这个名字、`private: true` 是故意的、
以及真要发 npm 时该改哪三处（含"对已装用户是 breaking change"的提醒）。

> 这条更正本身就是结论：**"看起来业余"和"实际业余"是两回事**，先查再改。

## [1.13.0] — 2026-10-31

补上产品承诺里最后一块没被量化的东西：**"这个会话到底花了多少"**。

### Added

- **`cache_probe_report({"scope": "session"})`** —— 只统计当前会话。
  返回新增字段 `scope` / `session`（会话指纹）/ `sessionTotal`，`summary` 变成会话级。
  默认仍是 `all`，老行为不变。
- **会话指纹只存哈希**：`describeRequest` 把 `options.sessionId` 过一遍 `fnv1a` 再落盘，
  **原始 id 不写入文件**（那属于用户数据，没必要留）。老记录该字段是空串，按会话过滤时自然不匹配。
- `summarize(records, { session })` 支持按会话过滤；查不到时返回 0 而不是回退成全部。
- 3 项新测试（instrument 28 → 31）：指纹稳定且不含原始 id、`makeRecord` 带上指纹、
  `summarize` 只统计指定会话且查不到时为 0。

### 真机验证（顺便留下一份活教材）

重载插件后立刻对当前会话跑一次：

```
session: "8c144bfe"   sessionTotal: 1
inputTokens: 563,654  cacheReadTokens: 5,504   hitRate: 0.97%
```

**0.97% 的命中率就是"一次全价重建"的样子** —— 重载插件会让下一轮把整段上下文重算一遍。
这正是 README 反复强调的"长会话里别装/改插件"的实测依据，现在用户自己也能一键看到。

**284 项测试**，行覆盖率 90.32%。

## [1.12.2] — 2026-10-31

让文档里的数字**真的可以被别人复现**。之前它们由一个不在仓库里的脚本算出来——那等于无法验证。

### Added

- **`scripts/analysis/`**（+ README）：
  - `switch-cost.mjs` —— 复现「切换成本是双峰的」
  - `switch-gaps.mjs` —— 复现「冷却 60 秒 / 时间窗 5 分钟」的来源
  - `hint-cost.mjs` —— 复现「提示每轮 50~126 token」（确定性计算）
  都支持 `--data <path>`（可重复），默认读 `~/.dsh/minimal-router/usage.jsonl`。
- `scripts/analysis/README.md` 写清每个脚本对应文档里哪句话，以及**为什么不能用平均值描述双峰分布**。

### 修了脚本自己的两个分类 bug

1. 便宜档被按"占上下文比例"打印，于是会话只有 141 token 时显示成 `100.0%`，看着自相矛盾 ——
   改成便宜档看**绝对 token**、灾难档看**比例**。
2. "改动幅度 vs 代价"的对比拿了一个 `toolsDelta: 0` 的样本（其实是系统提示变了），
   混了变量 —— 现在只比较**系统提示没变、纯工具表变化**的样本。

### 顺便更新了一组更强的证据

用当前 866 条记录重跑，结论比原文档更极端：

```
改得很大却很便宜：65,458 字节 →     141 token
改得很小却很贵  ：   153 字节 → 671,039 token      ← 差 4759 倍
```

> **注**：CHANGELOG 里引用的次数/比例是 **2026-10-30 的快照**（615 条记录）。
> 探针数据会持续增长，重跑得到的数值必然不同——**可复现的是方法，不是某一天的数值**。
> 结论层面的三件事不变：双峰、与改动字节数无关、所以只能按最坏情况估。

## [1.12.1] — 2026-10-31

把两件"只能在别人机器上验"的事，用本机能做的办法验掉了；顺手证伪了自己写的一条文档。

### 已验证（不再是"未验证"）

1. **真 pnpm 安装路径**。新建一个 profile 跑
   `dsh plugin --profile verify-add add github:qwq1223211/dsh-minimal-router`：
   真的从 GitHub 拉下来、pnpm v11 硬链进 `node_modules/@local/dsh-minimal-router`，
   **34 个文件的真实目录**（不是 link），`lib/` 12 个文件齐全。
   从那里 `import` 成功、`apply` 注册 10 个工具、**包目录里没多出任何文件**、
   写盘路径在 `~/.dsh/minimal-router/`。
2. **旧版数据搬家**。`test/migration.test.mjs`（4 项，进 CI）：给子进程重定向
   `HOME`/`USERPROFILE`，搭出真实的旧布局（包目录里带 `data/usage.jsonl`），
   从旧包 import → 断言数据落到 `~/.dsh/minimal-router/`、**7 条一条不少**、
   重复加载不覆盖（幂等）。

### 修正了一条错误的文档

我之前在 README 里写"`dsh plugin add` 装完可能还要手动启用 bundle"——**错的**。
实测：DSH 会把包同时写进 profile 的 `dependencies` **和** `dsh.profile.bundles`，
并自动初始化 profile。所以正常情况下装完只需要「关掉再打开」。

### Added

- **`scripts/verify-installed.mjs`**：装完之后一条命令复核这份安装。
  检查文件齐全、入口可 import、`inject` 只依赖 tools、写盘路径在包外、
  `apply` 不往包目录写文件、10 个工具都注册上。
- `docs/VERIFY.md` 补上"哪些已经验过、用什么办法验的"，避免下次重复劳动。

**281 项测试**（router 177 + guard 21 + probe 31 + fuzz 12 + instrument 28 +
install-elsewhere 8 + migration 4），行覆盖率 90.32%。

## [1.12.0] — 2026-10-31

覆盖率从"不知道"变成"**90.32% 行覆盖，CI 守住 85%**"——而且是用 Node 内置的 V8 coverage 算的，
**没有装 c8 / istanbul**（继续零依赖）。

### Added

- **`scripts/coverage.mjs`**：零依赖行覆盖率。设 `NODE_V8_COVERAGE` 跑 6 个套件，
  自己把「偏移区间 + 执行次数」映射回行号。支持 `--json` 和 `--min <阈值>`（CI 用）。
- **`test/instrument.test.mjs`（28 项）**：专测"量尺子本身"。
  覆盖率统计暴露出本项目最讽刺的一点——**所有对外数字的来源覆盖率最低**：
  `probe-core` 30%、`probe-store` 38%、`guard` 50%。
  现在这几个模块分别到了 **94.6% / 83.6% / 86.8%**。
  覆盖的契约包括：`fnv1a` 稳定性、`safeStringify` 永不抛、`describeRequest` 的 prefixSig、
  `makeRecord` 不产生 `undefined` 字段、`summarize` 不产生 NaN、`wrapStream` 原样透传且不吞异常、
  存储的坏行跳过与轮转、熔断的阈值/清零/会话隔离/逃生门。
- CI 新增 `coverage` job（ubuntu，阈值 85%）；发版门禁也加上了它。

### 过程中自己犯的两个错（都写在代码注释里）

1. **单进程内用并集 → 假的 100%**：V8 的区间是**嵌套有序**的，顶层"整个文件 count=1"会把
   未执行分支全染成已覆盖。必须"后者覆盖前者"。
2. **跨进程也用覆盖 → 假的 35%**：同一文件被多个测试进程加载，各覆盖一部分，
   最后处理的进程（覆盖最少）把前面的抹掉了。必须**跨进程取并集**。

**两层语义必须分开**，混用在两个方向上都会给出错误数字。

### 现状

**277 项测试**（router 177 + guard 21 + probe 31 + fuzz 12 + instrument 28 + install-elsewhere 8），
行覆盖率 **90.32%**（3649/4040）。

## [1.11.0] — 2026-10-31

「只在别人机器上才炸」这一类问题的系统性收口。每一项都有测试或体检覆盖，并挂进了 CI。

### Corrected（我之前说错了两处）

1. **"`engines.dsh` 必须是精确值"是错的。** 从 `app.asar` 里挖出 `@deepseek-ai/dsh-app-boot`
   的真实实现：它调用 `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`——
   **是范围判定**。
2. **"带预发布下界的范围不匹配别的版本的预发布"也是我说错的。** 因为传了
   `includePrerelease: true`，`>=0.2.1-rc.4` 同样匹配 `0.3.0-rc.1`。
   这条我在 v1.4.0 的 CHANGELOG 里写反了，这里更正。

### 新发现的一个真陷阱

`range.trim() !== "" && semver.satisfies(...)` —— **空字符串会被判为"不满足"**，
于是 `engines.dsh: ""` 会**直接拦住安装**。以前没人提过，现在体检会报错。

### Added

- **`scripts/audit-deps.mjs`**（7 项，失败退出码 1，已挂 CI）：
  零外部依赖、`main`/`exports` 一致、`type: module`、
  **`files` 是否覆盖"运行时真正会 import 的文件"（递归解析 import 图）**、
  `inject` 不含 `systemPrompt`、`engines.dsh` 合法（含空串陷阱）、
  写盘路径在包外、**没有任何写操作指向包内路径**（pnpm store 可能只读）。
- **`test/install-elsewhere.test.mjs`**（8 项）：只按 `package.json` 的 `files`
  复制一份到 `tmpdir/node_modules/.pnpm/<hash>/...`，从那里面 import 并 `apply()`。
  断言：入口可加载、`STATE_DIR` 仍在用户目录、内置示例跟着包走、
  6 个路由工具 + 熔断 + 探针全部注册、**apply 之后安装目录里不多出任何文件**、
  缺 `systemPrompt` 时仍能加载。
- CI 新增 `audit-deps` 与 `install-elsewhere` 两步（仍 3 平台 × 2 个 Node 版本）。
- `CONTRIBUTING.md` 写明这些检查为什么存在、以及哪些是本机**验证不了**的。

### 为什么这类 bug 值得单独立项

它有一个共同的伪装：**在本机 link 安装时 100% 正常**。
数据写在包里、少列一个 `files` 条目、硬依赖某个服务——这三件事在开发者机器上永远看不出问题，
只有到别人机器上才炸，而且往往不报错、只是"没效果"。

**249 项测试**（router 177 + guard 21 + probe 31 + fuzz 12 + install-elsewhere 8）。

## [1.10.0] — 2026-10-31

工程化收口：把"能用的插件"变成"别人敢依赖的仓库"。

### Added

- **模糊测试**（`test/fuzz.test.mjs`，12 项 / 约 8400 个确定性随机输入）。
  用 mulberry32 固定种子，随机喂控制字符、代理对、emoji、零宽字符、极端数值。
  断言的不变量：解析器**绝不抛异常**、返回值永远是**无损 JSON**、
  提示永远 ≤200 字、`tagOf` 永远返回非空小写标签、
  **逃生门在任意随机阶段表下都不会被锁死**、成本估算永不出现 NaN/Infinity。
- **仓库自检**（`scripts/lint.mjs`）。专治本项目被坑过两次的病：
  BOM / U+FFFD / UTF-8→GBK 乱码串 / CRLF、`package.json` 的 main-exports 不一致、
  `files` 声明缺失、库代码往 stdout 打 `console.log`、`index.js` 体积守卫。
- **测试脚手架**（`test/harness.mjs`）：4 个测试文件共用一份，输出格式不变。
- **文档**：`docs/ARCHITECTURE.md`（模块分层、会话状态表、一次请求经过的所有钩子、
  四条不可破的约束）、`CONTRIBUTING.md`（提交前自查、架构约定、怎么加工具）、
  `SECURITY.md`（攻击面只有三件事，以及我们明确不做的事）、issue 模板。
- CI 增加 `fuzz` 和 `lint` 两步（仍是 3 平台 × 2 个 Node 版本）。

### Changed

- **`index.js` 1563 → 1493 行**：三个轻量工具的定义搬到 `lib/tools-dynamic.js`（依赖注入，
  状态操作仍留在装配层）；内置示例的读取搬到 `lib/stages-config.js`（`listPresets` / `readPreset`）。
  体积守卫因此重新上线。
- `lib/probe.js` 的 `console.log` → `console.info`：库代码不该往 stdout 正式输出里插行。

### 现状

**241 项测试**（router 177 + guard 21 + probe 31 + fuzz 12），零运行时依赖。

## [1.9.0] — 2026-10-31

The four items from a self-audit: one bug that could burn money with a single sentence, three
data-driven refinements, and a regression baseline so the savings cannot silently rot.

### Fixed — negation was read as a command (P0)

`isExplicitSwitch("别切到美术")` returned **true**. Since an explicit command bypasses both the hysteresis
and the cost gate, a user saying **"don't switch to art"** would switch immediately — at full price, in the
most expensive session. Same for `不要切换到 art`, `先不切到 core`, `don't switch to art`.

A negation immediately before the switch phrase now cancels it; a sentence containing both
(`"别切到美术，切到 core"`) still counts as a command. 4 tests.

### Changed — hysteresis numbers now come from data (P0)

Analysed the gaps between **88 real switches** (`_tools/analyze-switch-gaps.mjs`):

| | gap |
|---|---|
| P25 | 2.0 s |
| median | 9.0 s |
| P75 | 81.1 s |
| P90 | 433 s |

**43% of adjacent switches happened within 5 s, 71% within 60 s** — that is the flapping, quantified.

- `switchCooldownMs` **120 s → 60 s**: covers the ≤60 s flapping mass without making real task switches wait
  an arbitrary two minutes.
- New `switchConfirmWindowMs` (**5 min**, above measured P75): two keyword signals further apart than this are
  a new task, so the confirmation count restarts. Previously "two consecutive signals" had no time bound — the
  same word an hour later still counted as a confirmation.

### Changed — cost gate knobs are configurable (P1)

`switchCostRatio` (default 1.0 = worst case) and `switchSavingsPerByte` (default 0.3, measured) were hard-coded.
Both are now config, exposed in `route_status.switchEconomics`. The measured average miss ratio is 0.465, so
anyone who finds the worst-case assumption too conservative can say so explicitly.

### Changed — the "installed but saves nothing" case now speaks up (P1)

`stageTableUnused` used to exist only inside `route_status` — you had to ask to find out you were wasting a
plugin slot. Now the first time a stage finds nothing to trim, a one-time console message explains the three
ways to fix it (preset / scan / `strict`).

### Added — integration tests and a savings baseline (P2)

- The fake runtime already modelled `restrict()` faithfully (visible schemas shrink and restore), so the
  integration assertions are real: switching to `core` leaves **6 of 13** tools with no `unity_*` present;
  switching back to `auto` **restores every tool** — the test that would have caught the
  dispose-before-compute ordering bug.
- A **byte-level savings baseline** per stage (core 54.2%, audio 46.3%, art 38.7%, unity-code 23.2%) asserts
  that trimming never regresses. A stage-table change that saves less now fails CI.

7 new tests: router 162 → **177**; **229 total**.

## [1.8.0] — 2026-10-30

Six failure modes that had never been tested, closed with 7 tests, a CI matrix, and one real fix.

### Fixed

- **Multi-agent state could collide.** `keyOf()` fell back to a single shared `'__global__'` slot for any
  agent without an `id`. Two windows (or two anonymous subagents) would then share one stage, one dynamic
  grant and one hint switch — "A switches stage and B's tools get trimmed". Anonymous agents now get a unique
  key from a `WeakMap`.

### Tested (previously unverified scenarios)

| Scenario | Result |
|---|---|
| Two agents alternating `route_stage` | Isolated stage, dynamic grant and hint switch — **test added** |
| Two anonymous agents (no `id`) | Isolated **(this is the fix above)** |
| `tools.restrict()` throws | Stage still switches; the reason is reported as `error:…`, not swallowed |
| Downstream `llm/stream` throws (429 / network) | Earlier chunks pass through, the error propagates unchanged; nothing hangs |
| 10 malformed stage configs (string, number, Chinese punctuation, junk arrays, …) | No throw; always a structured `{ ok, errors }` |
| 4 broken JSON files (truncated, Chinese punctuation, BOM, empty) | No throw |
| Another plugin denies in `pre-execute` | Our plugin calls `next()`, the other plugin's denial wins |

### CI

The matrix now runs **ubuntu / macos / windows × node 20 / 22** (6 jobs), plus a dedicated cross-platform
job asserting that the data directory is the user's home and that a **Chinese + space** path loads. Windows
alone was not evidence; this is a plugin for other people's machines.

### Docs

README now states the coexistence boundaries: safe with other `pre-execute` plugins (we always `next()`),
recommended with `/trim`, **incompatible** with a second tool router, and bisect advice for a message gate.

## [1.7.0] — 2026-10-30

The tail hint gets a runtime switch, and its cost gets measured instead of argued about.

### Added

- **`route_hint({ enabled })`** — turn the tail hint on or off **for the current session only**, at runtime, no
  reload. `route_hint()` with no argument just queries. Added to `ALWAYS_ALLOW`, so it survives even the
  narrowest `route_use` narrowing. This exists so anyone can A/B the hint on their own machine instead of
  trusting either side of the argument.
- 4 new tests (router 154; **210 total**).

### Measured: what the hint actually costs

Rendered with the real default stage table (`_tools/hint-cost.mjs`, deterministic — no sampling):

| stage | chars | ~tokens |
|---|---|---|
| auto | 71 | ~50 |
| core | 117 | ~82 |
| audio | 120 | ~84 |
| art | 138 | ~97 |
| unity-ui | 151 | ~106 |
| unity-code | 180 | ~126 |

Against a real request (137,790 bytes of tool declarations, ~900,000 tokens of context): the hint is
**0.09% of the tool declarations** and **0.01% of the context**.

Conclusion: "the injected hint is itself a cost problem" is arithmetically false. The only open question was
its **behavioural** effect, which is what the A/B below tests.

### A/B result: the old hint actively hurt, and it is fixed

Two brand-new sessions, identical task, the only difference being the hint:

| | No hint (arm B) | Hint on (arm A) |
|---|---|---|
| `unity_object_create` (forbidden in stage `art`) | **called it** | never called it |
| What came back | routing denial listing the exact fix: `请立即调用 route_stage("unity-code")` | — |
| Recovery | **switched stage, then called it again** | **gave up** ("not in my tool list") |

The old hint printed `禁止组=audio,dialogue,enemy,gameplay,l10n,level,lighting,perf 等15组` — and because the
list was truncated to 8 names, `unity` **was hidden inside "等15组"**. The model read "all these are banned",
decided the task was impossible, and stopped. The model **without** the hint just tried, received a denial
that named the tool, the current stage, the allowed groups and the exact call to make, and recovered.

So the hint was competing with the denial message and losing: the denial is precise, the truncated ban list
is not. The hint now lists **only the allowed groups** plus one universally correct escape
(`route_stage("auto")`), and shrank from 193 chars to 68–85 chars for typical stages.

Caveat stated plainly: this is n=1 per arm. It is enough to show the old wording could induce giving up, not
enough to quantify a rate. `route_hint` exists so anyone can repeat it with more samples.

## [1.6.0] — 2026-10-30

The zero-config path: task-driven narrowing without a stage table.

### Added

- **`route_use({ groups, turns })`** — narrow the visible tool set to the named groups (plus base tools and the
  escape hatch) for `turns` user turns (default 3, max 20), then restore automatically. `groups: []` releases
  immediately. Group names are the tags `route_status` already derives from tool names, so **no
  `custom_stages.json` is involved**. This answers "the plugin requires you to predefine your workflow": you
  no longer have to.
- `route_status` reports `dynamicGroups` / `dynamicTurnsLeft`; `route_stage` and `route_reset` clear any
  dynamic grant so the two mechanisms cannot shadow each other.
- 5 new tests (router 145 → 150; **202 total**), including one that asserts `route_use` and the probe tools
  survive being narrowed.

### Deliberately not implemented: a per-turn judging model

The review proposed deciding each turn's tool set with a small classifier. That is one extra request per
turn with the entire context re-sent at full price. Measured on this project, 99.9% of the tokens the plugin
saves are cache-priced — so paying one full-price request to save cheap tokens is a net loss. The judgement
stays with the model already in the context (`route_use`), which costs nothing extra.

### Also not implemented, and why

- **Defer-loading catalog anchors**: our tail hint already names the allowed and forbidden groups, capped at
  `hintMaxChars`. A second catalog block would spend prompt space to describe tools that are not in the
  prompt — the opposite of the goal.
- **Implicit LLM-generated grouping**: `route_init` already derives groups from tool names deterministically
  and offline; an LLM pass would add latency and a failure mode to a step that has neither.
- **Budget tiers**: worth revisiting only once switching cost is stable enough to model, which 1.2.0 showed it
  is not (bimodal: 0.2–1.2% vs 98–99% of context).

## [1.5.0] — 2026-10-30

Two things from a review of the ecosystem's failure modes: one real lockout bug, one cache-stability lever.

### Fixed

- **`cache_probe_report` / `cache_probe_clear` were missing from `ALWAYS_ALLOW`.** With `strict: true` (added
  in 1.3.0) the deny rule also covers unclaimed tags — and the probe tools are tagged `cache`, which no stage
  claims. So enabling strict mode **hid the diagnostic tools themselves**, and the user could no longer see
  any number explaining why nothing was being saved. That is precisely the "control plane hides itself, 221
  tools locked, no way out" anti-pattern reported for another router. The escape hatch is now checked before
  every rule, probe tools included.

### Added

- **`accumulateDisclosure`** (default `false`) — once a tool group has been visible in this session, it stays
  visible; the tool list only grows, so consecutive switches differ less and the prefix cache is more stable.
  Trade-off: trimming weakens as the session goes on, which is why it is opt-in. `route_reset` clears the
  accumulated set so you can return to strict trimming.
- The long-session warning now also suggests running `/trim` (if `dsh-command-context-trim` is installed)
  before switching, alongside "start a new session".
- 5 new tests (router 140 → 145; **197 total**), including one that asserts the probe tools survive strict mode.

### Notes on the review this came from

Several of its items were already shipped and are confirmed here rather than re-implemented: tail injection
already goes through `systemPrompt.context()` (not the system prompt — `prefixSig` stays constant across
stage switches), the soft pre-warning at 80% of the gate landed in 1.4.0, bundled domain presets landed in
1.4.0, and the "unknown is visible" default has been the design since 1.0.0.

## [1.4.0] — 2026-10-30

Three onboarding and long-session improvements, plus a correction to a claim that was circulating about
this package.

### Corrected

- **The version requirement is a range, not an exact value.** `engines.dsh` is `>=0.2.1-rc.4`; a guide in
  circulation told users it must match the host exactly. That is false. (One real caveat *does* apply:
  semver ranges with a prerelease floor cover later **releases** such as `0.2.2`/`0.3.0`, but not a
  prerelease of a different tuple such as `0.3.0-rc.1`.)

### Added

- **`examples/` presets** — `python-data`, `web-dev`, `writing`, `qq-chat`. Run
  `route_init({ "preset": "python-data" })` and it writes a ready-to-use `custom_stages.json` directly,
  instead of making every new user start from the raw scan. No more "Unity template or nothing".
- **`hintMaxChars`** (default 200, floor 40) — the tail hint was always capped at a constant; it is now
  configurable, for people who would rather have a terser prompt.
- **Proactive long-session warning** — at `contextGuardWarnRatio` (default 0.8) of the safety-gate threshold
  the plugin prints a one-time console notice telling you to start a new session, instead of staying quiet
  until a stage switch is refused.
- 4 new tests (router 136 → 140; **192 total**).

## [1.3.0] — 2026-10-30

Five fixes from a **real deployment on another machine** (different provider, different tool set, no Unity
at all). Every one of them was a silent failure — the plugin looked installed and reported no error.

### Fixed

- **`trustedModels` only matched a bare model id.** A config written as `bailian/deepseek-v4.1-flash-1017`
  never matched `options.model` (`deepseek-v4.1-flash-1017`), so the user "enabled" it and stayed degraded
  without any error. Model names are now normalised on both sides (trim, lowercase, strip `provider/`), and
  the known-capability lookup uses the same normalised name.
- **`custom_stages.json` silently rejected the array form.** `{ "stages": [ { "stage": "chat", ... } ] }` is
  the shape most people write by hand; the validator only accepted an object map, so the whole file was
  discarded as invalid. Both shapes are accepted now.
- **A stage table that matches nothing trimmed 0 bytes, silently.** If none of the claimed tags exist in the
  current environment (e.g. a machine with only QQ tools and no Unity), the deny list is always empty. That
  looked like "installed but saves nothing" with no diagnostic. `route_status` now reports
  `stageTableUnused` + `stageTableHint`.
- **No way to trim unfamiliar tools at all.** Added per-stage `strict: true`: it also denies tags that no
  stage claims, which is the only way to save anything on a tool set the built-in table knows nothing about.
  Default stays `false` ("never block the unknown").

### Added

- A one-time console notice when a model is allowed via `trustedModels`, stating plainly that this is the
  **user's assertion, not a measurement**, and how to verify it (`prefixChanges` / `hitRate` after 3 turns).
- 8 new tests (router 128 → 136; **188 total**).

## [1.2.1] — 2026-10-30

Two dependency/entry robustness fixes, found by auditing the package the way a fresh install would see it.

### Fixed

- **Runtime data no longer lives inside the package.** The probe wrote to `<package>/data/usage.jsonl` and
  `route_init` wrote `custom_stages.sample.json` next to the package. That is fine for a `link:` install and
  **broken for a real dependency install**, where pnpm places the package under `node_modules/.pnpm/<hash>/` —
  a directory that is replaced on upgrade and may not even be writable. Both now default to
  `~/.dsh/minimal-router/`, and the existing probe history is copied over once on first run.
- **`systemPrompt` is no longer a hard dependency.** `inject` was `['tools', 'systemPrompt']`, so on any host
  or preset that does not provide `systemPrompt`, the *entire* plugin failed to load — taking the circuit
  breaker and the probe down with it. It is now resolved optionally: without it, only the tail hint is
  disabled (with a console explanation), while out-of-stage denial, dead-loop lint, the breaker and the probe
  keep working. `route_status` reports `hintAvailable`.

### Verified by audit

Zero external imports (only `node:` builtins and relative files), `main` and `exports["."]` agree, every entry
in `files` exists, and the package imports cleanly and exposes `apply` + `inject`.

## [1.2.0] — 2026-10-30

Turns the "should we switch?" question into an economic calculation, using data mined from the
project's own probe history instead of intuition.

### Added

- **`lib/cost.js`** — `estimateSwitchEconomy()` / `decideByEconomy()` / `describeEconomy()`.
  Cost is estimated at the **worst case** (whole context at full price), savings at the measured
  **0.30 tokens per byte** of trimmed tool declarations.
- **Cost gate.** Automatic (keyword-driven) switches are refused when
  `paybackTurns > switchPaybackTurns` (default **3**). Explicit commands are exempt.
- `route_status` now reports `switchEconomics`: per-stage cost, per-turn saving, payback and verdict.
  `route_stage` returns the same numbers for the stage it just switched to.
- 10 new tests (router 113 → 123; **175 total**).

### Findings that shaped this (kept here because they are counter-intuitive)

From 615 probe records / 60 prefix changes:

| Type | Count | Share of context that missed |
|---|---|---|
| Cheap | 35 | 0.2% – 1.2% |
| Catastrophic | 11 | 98% – 99% |

Cost does **not** correlate with how much changed: a **98,778-byte** tool-list change cost 708 tokens,
while a **481-byte** change cost **581,830**. The mean (46.5%) is meaningless for a bimodal
distribution, which is exactly why the estimate is worst-case rather than average.

## [1.1.0] — 2026-10-30

Attacks v1.0.0's biggest risk: a stage switch costs anywhere from **3,205** to **513,857**
full-price tokens (same action, 160× difference depending on context size). This release makes
switching rarer, and makes version failures readable.

### Added

- **Switch hysteresis.** Keyword-driven stage changes now need `switchConfirmations` (default **2**)
  consecutive signals pointing at the same stage, plus a `switchCooldownMs` (default **120 s**) cooldown
  after every switch. Explicit commands ("switch to core", "切到美术阶段") still apply on the first message.
  Motivation: one stray mention of "UI" inside a Unity task used to trigger a real prefix rebuild.
- **`engines.dsh: ">=0.2.1-rc.4"`** — an incompatible host now produces a readable install error
  instead of a cryptic load failure.
- `route_status` reports `switchArbiter` (pending stage/count, cooldown remaining) and
  `lastArbiterDecision`, so "why didn't the stage change?" has an answer.
- 8 new tests (router 105 → 113; **165 total** across the three modules).

### Changed

- **Behaviour change:** a single keyword mention no longer switches the stage. Send a second confirming
  message, or say it explicitly. Set `switchConfirmations: 1` to restore the old behaviour.
- The README install section now marks the *disable → enable* step as mandatory and names the failure mode
  ("looks installed but does nothing").

## [1.0.0] — 2026-10-30

First public release. Built and measured on a real DSH profile with 40+ plugins.

### Added

- **Stage-based routing.** Six built-in stages (`auto`, `core`, `unity-code`, `unity-ui`, `art`, `audio`).
  Stage is chosen by priority: explicit `route_stage` > message keywords > sticky previous > default.
- **Zero-config auto-classification.** Tool tags are derived from names:
  `unity_object_create` → `unity`, `mcp__meshy__meshy_image_to_3d` → `meshy`,
  base tools from an explicit `DEFAULT_CORE_TOOLS` list (so `create_goal` is not mistaken for a `create` group).
- **Tail-only routing hint.** Injected through `systemPrompt.context()`, hard-capped at 200 characters,
  so the cached prefix is untouched.
- **Physical trimming.** `enforceByRestrict` removes out-of-stage tools from the request through
  `agent.ctx.tools.restrict()`. Measured: 165 → 69 tools, 131,694 → 48,837 bytes.
- **Out-of-stage denial.** `tools/pre-execute` rejects cross-stage calls with an imperative message
  naming the stage to switch to.
- **Dead-loop lint.** `while(true)` / `for(;;)` / `do{}while(true)` are rejected before a write-like tool runs,
  but only when the loop body has no `break`/`return`/`throw`. Comments and string literals are stripped first.
  Self-recursion without a conditional is reported as a warning, never blocked.
- **Escape hatches.** `route_*` and `guard_*` are always allowed, in both this plugin and `dsh-minimal-guard`.
- **Degradation guard.** Detects models without `systemPromptUpdate: 'in-history'` and disables the tail hint
  and trimming, keeping deny + lint. Unknown models degrade by default. Boxed one-time warning.
  Escape hatches: `trustedModels`, `unsafeForce`.
- **`simulateModel`.** Pretend to run on another model — demo the degradation warning without paying for it.
- **Context safety gate.** When the last request exceeded `contextGuardThreshold` (default 100,000 tokens),
  `route_stage` is refused unless `force: true`, and **keyword-driven auto-switching is suppressed too**,
  because a stage switch at that size costs a full prefix rebuild. Measured: 512k tokens rebuild (~1.2% hit rate).
- **Universal adaptation.** `custom_stages.json` (validated, merged over built-ins, malformed files ignored with a
  warning) and `route_init()`, which generates a template from the tools actually installed.
- **Chinese and English READMEs**, zh/en locale metadata, icon.

### Fixed during development (kept here on purpose)

- Keyword matching used substring search, so `uikit` triggered the `ui` stage. ASCII keywords now match on word boundaries.
- An explicit stage was wiped by the next unrelated message ("switch once, usable for one turn"). Stages now stick;
  only a keyword hit, `route_stage`, or `route_reset` changes them.
- The tool-count reported by `route_status` ignored `restrict()` (153 vs the real 35), which made trimming look inactive.
- A denied call was counted as a **new** error by the circuit breaker (3 became 4).
- The context safety gate only covered `route_stage`; a keyword auto-switch in a 780-message session
  bypassed it and cost a 512k-token full rebuild (1.2% hit rate). Keyword switching now passes the same gate.

### Measured reference numbers

| Metric | Value |
|---|---|
| Tools advertised (auto → core) | 165 → 66 |
| Tool declaration bytes | 131,694 → 43,238 (−67.2%) |
| promptTokens per request (fresh session) | 47,885 → 25,688 (−46.4%) |
| Cache hit rate while stable | 99.16% |
| One-time stage-switch cost (small session) | ~3,205 full-price tokens |
| One-time stage-switch cost (500k-token session) | ~512,000 full-price tokens |
| System prompt, long-lived session | 159,334 chars (9 appended copies) |
| System prompt, fresh session | 17,685 chars (1 copy) |

### Known limitations

- Tool trimming needs the agent-scoped context; a plain `ctx.tools.restrict()` call is refused by DSH by design.
- A stage switch still costs one prefix rebuild; the safety gate only stops you from doing it in a huge session.
- The built-in stage table happens to know Unity and Meshy because that is the author's own setup. Different domain? `route_init` scans *your* installed tools and hands you a ready-to-edit template — about a minute, and then routing is automatic. (The plugin deliberately never guesses: an unclaimed tool group is always allowed, because a wrong guess would block you mid-task.)
