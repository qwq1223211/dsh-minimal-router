# Changelog

All notable changes to `dsh-minimal-router`.
Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [SemVer](https://semver.org/).

## [1.19.9] — 2026-11-07

**把运行时可观测性补齐。8 项改进，全部来自 2,809 条活动日志 + 21 个历史会话的实测。**

### P0 —— 让已有数据变得可用

| 改进 | 改前 | 改后 |
|---|---|---|
| 探针记阶段 | 17/17 条记录 `stage: "n/a"` | 新增 `lib/live.js`（会话→阶段共享表），探针按会话哈希查；实测可读到 `unity-ui` |
| 切换记触发词 | 只有 `by:"keyword"` | 新增 `kw`（命中的词）+ `s`（会话哈希）；新增 `matchedKeyword()` |
| degrade 去重 | 同一条原因被写 287 次（占全部事件 10%） | 按 `(model, reason)` 每个进程只记一次 |

### P1 —— 减少误判与误导

- **`art` 词表去掉裸词 `model`**：它在开发语境里太常见（"数据模型"/"model 层"），一命中就切美术阶段 = 一次前缀重建。中文"模型"保留。
- **删除 `estimatedAdvertised`**：它按"注册数 − deny"算，和真实值差 31 个（base/作用域工具），留着只会误导。要看真实数字只能用探针。

### P2 —— 体验与整洁

- **`route_status({ compact: true })`**：完整输出约 4K token，compact 只回 `stage/by/toolCount/restrictedToolCount/unionEnabled`。
- **探针跨轮转读取**：当前文件不够时自动读 `usage.jsonl.1`（实测 `.1` 里有 5,462 条、2.1 MB 历史，原来完全读不到）；`count()` 同样合并。
- **`lib/union.js` 标记 `@deprecated`**：按 ROADMAP 的"先废弃、后删除"，下一版可删（连带两个测试文件）。

### 数据依据（7 天台账）

```
switch 313 次：auto→art 289 / auto→document-write+python-code 24
  其中 278 次（89%）集中在 11 个 5 分钟窗口 → 压测/实验，不是真实使用
deny   238 次：lint/write 66（已修）、unity_object_create 123、meshy 41
degrade 287 次：全是同一句 deepseek-v4-pro leading-only
```

**全量 392 项通过**（382 → 392，新增 `test/live.test.mjs` 9 条 + compact 1 条）。

## [1.19.8] — 2026-11-07

**把运行逻辑写进说明书。** 纯文档，不改行为。

### Added —— `docs/RUNTIME.md`

按代码逐段核实的运行时手册，回答"它运行时到底做了什么、什么顺序"：

| 章节 | 内容 |
|---|---|
| 启动时 | `apply()` 的 7 步：配置归一化 → 并集开关 → 阶段表三层合并 → Proxy 包装 → 注册 11 个工具 → 挂 3 个模块 → 挂 4 个钩子 |
| 用户发消息 | 四道闸门的**代码顺序**：上下文（10 万）→ 回本（≤3 轮）→ 迟滞（2 次确认 + 60s）→ 应用；以及各自的例外（`force:true`、显式切换） |
| 每次工具调用 | `pre-execute` 的 6 步：逃生门 → 使用画像 → 体检 → 阶段越界 → 反馈闭环 → 异常放行 |
| 判定顺序 | `decideOutOfStage` 的 6 条规则，含"`auto` 不裁剪"是 `stage === 'auto'` 特判（**不是**"allow 为空"）这一易错点 |
| 收窄落地 | 为什么只用 `deny` 不用 `allow`（allow 会隐藏 `read`/`write`，实测 4/4 会话丢失），`run_code` 例外，失败即降级 |
| 数据文件 | 4 个文件的内容与写入时机 |
| 默认值表 | 15 项关键配置的默认值（含 `enforceByRestrict` 仓库默认 `false`、本机 profile 开 `true`） |
| 降级路径 | 模块加载失败 / restrict 不可用 / 模型不支持 in-history / 钩子抛错 → 各自的表现 |
| 三个口径 | `registeredToolCount` / `estimatedAdvertised` / 探针 `tools` 为什么差 31 个，做对比只用探针 |

### Changed

三个 README 的**首屏**都加了「它怎么跑的（简版）」：两个入口、四道闸门、6 步判定、安全网，并链到 `docs/RUNTIME.md`。

### 顺带更正一处说法

`task_*` 工具**不在** `ALWAYS_ALLOW` 里。它永远可用是因为**未认领标签默认放行**（`decideOutOfStage` 第 5 条），
不是逃生门——两种机制效果相同但原因不同，说明书里已经写清。

**全量 382 项通过。**

## [1.19.7] — 2026-11-07

**成本模型按真机实测校准：一次性支出要按"收窄后"的上下文算。**

### 实测（新会话，auto → unity-ui）

| 指标 | 切换前 | 切换后 | 变化 |
|---|---|---|---|
| 工具数（探针） | 270 | 172 | −98 |
| toolsChars | 237,350 | 120,540 | −116,810（−49.2%） |
| 每轮省 | — | — | ≈ −35,043 token |
| 重建实际成本 | — | 60,045 | 旧模型预估 97,189 |

旧公式 `costTokens = 上下文 × 比例` 假设重建要把**收窄前**的整段重新发一遍。
但重建时发出去的就是**收窄后**的工具表，实测成本正好是 `97,189 − 35,043 ≈ 62,146`。

### Changed

`estimateSwitchEconomy()` 的成本项改为 `max(0, 上下文 − 每轮省下) × 重建比例`。
效果：回本轮数 **2.78 → 1.77**，与实测的约 **1.7 轮** 一致；
在临界点上不会再"高估成本 → 错误拒绝切换"。

顺带加了两条测试：真机校准值（97,189 / 116,810 → 1.77）与"省下的量 ≥ 上下文"的防呆（成本钳到 0，不为负）。

### Docs

`docs/LIMITS.md` 新增 §六「切换一次的真实成本」，含前后对比表、模型修正说明，
以及 `estimatedAdvertised 141` 与探针 `172` 差 31 个 base 工具的口径提醒。

**全量 382 项通过**（380 → 382）。

## [1.19.6] — 2026-11-07

**修一个真误拦，并顺手修正一个我上一轮引入的回归。**

### Fixed —— 体检不再拦内容型工具（真机证据：66 次误拦）

`route_status` 旁边的活动日志（`activity.jsonl`）里，198 次 `deny` 只有 3 个工具：

| 工具 | 次数 | 来源 | 是否合理 |
|---|---|---|---|
| unity_object_create | 99 | by=stage | ✅ 合理（在 art/core 阶段） |
| meshy_image_to_3d | 33 | by=stage | ✅ 合理（在非 art 阶段） |
| **write** | **66** | **by=lint** | ❌ **误拦** |

66 次全部发生在 2026-10-31 同一天，原因：`write` / `edit` 的参数就是**文件内容**，
而体检把"写入内容里的循环"当成"即将执行的死循环"。写一个合法的无限循环
（游戏主循环、守护进程、事件循环）会被**拒绝写入**。

**改法（方案 C）**：把决策从 index.js 搬进 `lib/lint.js` 的新函数 `decideLint()`，支持按工具分级：

- 内容型工具（`write` / `edit`，见 `LINT_WARN_TOOLS`）→ 只 `warn`，照常写入
- 执行型工具（`pwsh` / `terminal` / `python`）→ 仍然 `deny`（保护没丢）
- `skipTools` / `mode=off` 语义不变

顺带的好处：决策可以单测，不需要起插件；`index.js` **1197 → 1190（净减 7 行）**。

### Fixed —— 我上一轮把 tool-inventory 弄挂了（回归）

`_tools/manage-plugins.mjs` 给 5 个包补 `exports` 时，把 `main: "index.js"` 原样写成
`exports["."] = "index.js"`。Node 要求以 `./` 开头，于是：

```
tool-inventory-v5: failed to import: Invalid "exports" main target "index.js"
```

**tool_inventory 的三个工具因此加载失败。** 已修包内 `exports` 为 `"./index.js"`，
并在脚本里加了归一化（不以 `./` 开头就补上），避免以后再犯。

### Tests

- 新增 `test/lint-decide.test.mjs`（9 条）：write/edit → warn、pwsh → deny、有 break 放行、skip/off/warn 模式、空参数
- `router.test.mjs` 的旧断言（write 被拦）改为新契约，并新增一条"同一段代码交给 pwsh 仍被拦"

**全量 380 项通过**（370 → 380）。

## [1.19.5] — 2026-10-31

**真机验收抓到的自违规修复。** v1.19.4 的施工单里写着"byTag 不写入 route_status 输出"，
而实际实现把整个 toolUsage 对象直接抛了出去，byTag 跟着漏了 —— 实测多出 **41 条**、约 1.5KB。

### Fixed

index.js 的 toolUsage 输出改为**剔除 byTag** 的公开视图：

    toolUsage: toolUsage && (({ byTag: _byTag, ...publicPart }) => publicPart)(toolUsage),

- byTag 仍保留在局部常量里，供 findUnclaimed() 计算 used/total/verdict
- 对外输出只保留原有字段（trackedTools / unusedTools / unusedGroups / topUsed / advice）
- index.js 仍是 **1197 行**（净 0 行）
- usageTracking 关闭时 toolUsage 为 null，该表达式同样返回 null

### 真机验收数据（v1.19.4 首次上线时取得）

| 标签 | bytes | used/total | verdict |
|---|---|---|---|
| **ego** | **28,503**（最大） | **2 / 35** | **do-not-claim** |
| comfyui | 8,661 | 1 / 4 | do-not-claim |
| route | 3,398 | 2 / 7 | do-not-claim |
| **screen** | 2,978 | 0 / 3 | **claim-candidate** |
| task | 2,026 | 3 / 3 | do-not-claim |
| sticker | 1,200 | 0 / 3 | claim-candidate |

**体积最大的 ego 恰恰是"用过的"**——这正是认领判据存在的意义：按"谁最大就认领谁"的老思路，
会一刀砍掉正在用的工具。task（task-guard 自己的 3 个工具）全部用过，同样一个都不能裁。

同时确认 route_status.unionEnabled === false 在真机可见（v1.19.2 的默认关闭已生效）。

**全量 370 项通过。**

## [1.19.4] — 2026-10-31

**把"认领判据"从一句价值观变成一张能算的表。** 默认动作是**不认领**。

### Added —— `unclaimedTags` 多三列：`used` / `total` / `verdict`

`route_status.unclaimedTags` 现在每项是 `{ tag, count, bytes, used, total, verdict }`：

| verdict | 含义 | 建议 |
|---|---|---|
| `claim-candidate` | 该标签的工具**一个都没被调用过** | 候选，仍需人判断领域专用性 |
| `do-not-claim` | **有工具真的被调用过** | 绝不认领（会裁掉在用的） |
| `no-data` | 用量画像里查不到 | 证据不足，不动 |

数据来源：`lib/usage.js` 的 `summarize()` 新增全量 `byTag`（不截断、不过滤）；
`lib/stages-config.js` 的 `findUnclaimed()` 合成三列并给判定。
`verdict` **不驱动任何裁剪行为**——它只是给人看的一列。

### Added —— `docs/CLAIMING.md`

把评审里那段判断落成文件：两种账本（声明 vs 调用）、三条准入、三条拒入、
一个算式（`每轮省 ≈ bytes × 0.25` / `回本 = 上下文 / 每轮省`）、以及适用域
（短会话几乎必然亏；只有长会话 + 巨型工具表才值得）。

### Verified before coding（开工前三件核实）

1. **`byTag` 的标签集合覆盖 `unclaimedTags`**：用真实 tracker 跑一遍，未认领列表里每个标签都能在 `byTag` 查到
   （`byTag` 额外含 `core` 与被认领标签，那是 `findUnclaimed` 主动跳过的，不是缺口）
2. **`summarize()` 无副作用**：函数体内无 `writeFile` / `appendFile` / `flush` / `dirty` 赋值 → `toolUsage` 上提安全
3. **`byTag` 遍历全部 `names`、无过滤**：实测覆盖 `core/ego/futureplug/unity`，过滤只发生在 `unusedGroups`

### Changed —— `index.js` 1198 → **1197**（净减 1 行）

把 `toolUsage` 上提为局部常量，`unclaimedTags` 与 `toolUsage` 共用同一份画像，
原来那 3 行内联三元压成 1 行 + 1 行引用。仍在 1200 守卫线内。

### Tests

`test/infra.test.mjs` 15 → **22 条**，新增 5 条钉死认领判据，外加 2 条本轮校准补的：
`claim-candidate` / `do-not-claim`（最重要）/ `no-data`（`used` 必须是 `null` 不是 `undefined`）/
排序不受 verdict 影响 / `byTag` 覆盖全量且 `unusedGroups` 语义未变。

补的 2 条：
- **`usage = null`（usageTracking 关闭）** → 每项都落 `no-data` 且 `used === null`，`bytes` 照常给出
- **端到端口径**：走真实 `tracker.record()` + `summarize()` → 该标签 `used === 1` → `findUnclaimed` 判 `do-not-claim`，
  并断言"未认领列表里每个标签都能在 `byTag` 里查到"（否则会误落假 `no-data`）

**全量 370 项通过。**

## [1.19.3] — 2026-10-31

**加固版，没有新功能**：把三条"口头约定"变成红绿信号。改动全部在 `test/`、`docs/`、`scripts/lint.mjs`，
**`index.js` 一行没动（仍 1198）**。

### Added —— 6 条新断言（`test/infra.test.mjs` 8 → 15 条）

1. **模块默认关闭**：用 `import('../lib/union.js?fresh=...')` 拿全新实例断言，
   不依赖"测试按声明顺序执行"。旧写法在有人给测试文件加 `concurrency` 后会静默失效。
2. **`scoreText` 等高夹具**（主断言）：两个画像关键词完全相同 → 分数相等 → margin 0；
   关闭态必须返回 `null`（放弃路径保留），开启态才给两个阶段。该夹具对权重调整不敏感。
3. **`scoreText` 回归样例**（辅断言）：实测 score 21.793 / second 14.075 / margin 0.354，
   关闭态 → 单阶段 `beta-stage`，开启态 → 两阶段。注释写明"权重变了要重新采样"。
4. **`detectStage` 双模式对照**：同一句关闭态 `python-code`、开启态 `document-write+python-code`。
5. **`strict` 不被并集继承**（两条）：合成阶段没有 `strict` 字段；
   子阶段标 `strict:true` 也不外溢到并集——未认领标签仍放行。
   （测试里必须用 `withUnion()` 包一层，否则普通展开会丢 Proxy 导致"假绿"。）
6. **探针记录键白名单完全一致**（20 键）：以后谁往记录里加字段（尤其归因字段）这条立刻红，
   逼迫改字段的人同步白名单与 `docs/LIMITS.md`。

### Docs

- `docs/LIMITS.md`：补"并集不继承 strict 是设计意图不是巧合"、"`bytes` 是展示值（与 token 非 1:1、不参与裁剪）"、
  本地分类器置信度初始默认 `0.75`（可配 `localMinConfidence`）
- 新增 `docs/ROADMAP.md`：`index.js` 三段拆分（触发条件 >1150 行或需净增 >5 行）、
  并集去留（<10 次/周 → 先 `@deprecated` 一版再删）、探针 `stage` 接线的先后顺序

### Changed —— lint 文案

- 超线时输出"已超 N 行"，未超时输出"还剩 N 行"，不再出现负数余量；阈值不变（>1100 警告 / >1200 失败）

**全量 363 项通过**（356 → 363）。

## [1.19.2] — 2026-10-31

> This is a personal infrastructure release. Experimental unions are disabled by default. Designed for extensibility.

个人基建收尾版：不再为"小白体验"牺牲架构，底线是**支撑后续大量第三方插件与我自己的新插件**。

### Changed —— 并集转 `@experimental`，默认关闭

- 新增配置 `unionEnabled`（默认 **false**），`cordis.patch.yml` 里显式写出并注明原因
- 关闭时 `detectStage` 与打分器**都不产出** `"a+b"`，行为与引入并集之前完全一致
- `route_status` 新增 `unionEnabled` 字段，一眼可见当前是否启用
- 实测代价（写进 `docs/LIMITS.md`）：并集 154 工具 / 134,539 字节 vs 单阶段 54 / 46,326（**约 3 倍**）

### Added —— 未认领标签的体积归因

- `lib/classify.js` 新增 `tagBytesOf(schemas, coreTools)`：按标签累加工具声明字节
- `findUnclaimed` 输出增加 `bytes`（无数据填 **0**，绝不 undefined），并按体积降序
- `route_status` 的 `unclaimedTags` 现在带体积 —— 由**人**决定要不要写 `custom_stages.json`，插件不擅自裁剪

### Hardened —— 未认领即放行（基建底线）

- 新增 `test/infra.test.mjs`（8 项）：未认领标签在**任何阶段**（含并集）都不得被拒绝、
  永不进 deny、唯一例外是阶段显式 `strict:true`
- 新增断言：探针记录**不含**任何"哪个插件改了什么"的归因字段（不越权）

### Refactor —— index.js 腾行

- `RENDER` / `toNum` 搬到 `lib/util.js`，index.js **1198 → 1195 行**（加完新功能后回到 1198，仍在 1200 守卫线内）

### Docs

- 新增 `docs/LIMITS.md`：并集代价、本地小模型接口与启用条件（本版不写代码）、未认领放行、
  收窄够不到的东西、探针职责边界

**全量 356 项通过。**

## [1.19.1] — 2026-10-31

并集功能落地过程中，端到端测试抓出了**两个真 bug**（都不是并集算法本身的问题）。

### Fixed 1：关键词路径会"抢先 return"，并集永远不触发

`detectStage` 原来是"第一个命中的阶段直接返回"。
跨领域句"写个 Python 脚本…整理成周报文档"里，**"脚本"同时命中 python-code，句子又命中 document-write**，
但第一次命中就 return 了，调用方 `index.js` 的意图判定（会返回并集）**根本没机会跑**。

修法：`detectStage` 先收集所有命中阶段；**命中 ≥2 个时**委托 `lib/intent.js` 的打分器给结论，
且只接受"结论里的阶段都真的命中过关键词"的结果（防止打分器凭空引入阶段）。
Unity 场景不受影响（"做个 Unity UI 设置界面"仍判 unity-ui，有测试守着）。

### Fixed 2：`mergeStages` 把 Proxy 吃掉了

`index.js:434` 是 `cfg.stages = mergeStages(DEFAULT_STAGES, …)`，
而 `mergeStages` 返回**普通对象** → `DEFAULT_STAGES` 上的 Proxy 丢失 →
`cfg.stages["document-write+python-code"]` 变成 `undefined` →
并集名被当成"未知阶段"，`route_stage` 直接拒绝。

修法：在 `lib/stages-config.js` 的 `mergeStages` 返回值上重新包一层 `withUnion`。
**仍然没有碰 index.js。**

### Added：端到端测试（验收标准本身）

`test/union-e2e.test.mjs` 起一个假 ctx，调**真实的 `apply()`**，
走真实的 `agent/created` + `agent/inbox/claimed` 钩子，再调**真实的 `route_status`**：

- 输入 "帮我写个 Python 脚本爬取网页，然后整理成一份周报文档"
- `route_status.stage === "document-write+python-code"`
- `restrictedFor` 也是并集，`restrictedToolCount > 0`
- `terminal_spawn` / `office_docx_create` / `study_card_add` 都还在
- `unity_object_create` / `meshy_image_to_3d` 被摘掉
- 未认领标签（ego）保留 —— 不误杀新插件是设计底线

写这个测试还暴露了两个夹具坑：必须喂 `agent/created`（否则 router 没有 agentRefs，收窄不生效）、
必须关掉 `autoRestrictPolicy`（上下文为 0 时算不出收益，会被判"不划算"）。

**全量 348 项通过**。

## [1.19.0] — 2026-10-31

**多领域并集**：跨领域任务不再"判不出来就什么都不做"。

### 起因

意图判断器（`lib/intent.js`）在两个阶段分数接近时 `margin` 不够，直接 `return null`。
于是"帮我写个 Python 脚本爬取网页，然后整理成一份周报文档"这种句子**一个领域都认不出来**，
router 停在原地，两边的工具都没放开。

### 改了什么

1. `scoreText` 现在可以返回 1~2 个阶段：
   ```
   stage:  "document-write+python-code"
   stages: ["document-write", "python-code"]
   reason: "union-strong-second"
   ```
2. **判据从"只看相对差距"改成"看绝对强度"**：
   目标句里文档侧 22.7 分、代码侧 15.4 分，margin 32%（超过 0.28 阈值）——
   老规则会判成"单领域"，但 15.4 分根本不是噪音。
   新规则：**第二名本身够强（≥ minScore×3）且第一名没压倒它（margin < 0.55）→ 并集**。
3. `lib/union.js`：用 **Proxy** 让 `stages["a+b"]` 能现场合成并集定义。
   `index.js` 里所有阶段访问本来就是 `stages[name]` 下标读取（含 classify.js / prompt.js），
   所以**一个 Proxy 全部生效，index.js 一行没动（仍是 1198 行）**。
   `Object.keys` 仍只列真实阶段，合成名不会漏进配置与状态面板。
4. 新增两个**非 Unity** 阶段 `python-code` / `document-write`，allow 里同时写
   理想标签（python/office，本机不存在但无害）与真实标签（terminal/study），
   保证并集在真机上**看得见**而不是空转。

### 测试

新增 `test/union.test.mjs`（17 项），刻意全部使用非 Unity 场景：

- 并集名的解析/合成/去重/缓存稳定性
- 目标句 → 同时返回两个阶段
- 单领域句、Unity UI 句、无关句**均无回归**
- 状态机接受并集名（不被当成未知阶段拒掉）
- 越界判定：并集里两边的工具都放行，`unity_*` 仍被拦

**全量 346 项通过**（原 329 项）。

## [1.18.0] — 2026-10-31

三件"主动的聪明"：不再只是被动响应，而是**自己判断划不划算、该不该开口、拦得对不对**。

### 新增 · 智能开关（`autoRestrictPolicy`，默认开）
切阶段时先算账：重建成本（≈ 当前上下文全价）÷ 每轮收益（被摘掉那部分工具声明的 token）= 回本轮数。
- 回本 ≤ `switchPaybackTurns`（默认 3 轮）→ 照常物理瘦身
- 回本 > 3 轮（典型：50 万 token 的会话）→ **只提示不瘦身**，避免白付一次全量重建
- `route_stage` 显式切换不受影响（用户亲口要求的照办）

### 新增 · 主动建议（尾部提示里的 `Tip:`）
语义分没到"敢切"的门槛、但明显有感时，不切阶段，只在尾部提示里加一句：
`Tip: looks like art; if so, route_use(["art"],3).`
把决定权交回模型，零额外请求，仍受 200 字硬上限约束。

### 新增 · 拦截回收统计（`denyRecovery`）
被拦后 2 分钟内模型换了个工具继续干 → 记一次"自己恢复"。
`route_status.denyRecovery` 给出 `{denied, recovered, rate, note}`，用来判断**拦截阈值是不是太严、提示文案是不是太模糊**。

### 新增 · 本机调参脚本
```
node scripts/tune.mjs --days 7
```
读 `~/.dsh/minimal-router/` 下的 activity / tool-usage，直接给你调参建议（数据不出本机）。

### 测试
- 320 → **329**（feedback 7 + intent 探针 2）

## [1.17.0] — 2026-10-31

**"它到底做了什么"** —— 新增活动日志与 `route_activity` 工具。

### 新增 · 活动日志（`lib/activity.js`）
- 记录七类事件：`switch`（切阶段）、`restrict`（改工具表）、`deny`（拦调用）、`block`（闸门拦截）、`grant`（临时收窄）、`reset`（复位）、`degrade`（降级）
- 落盘 `~/.dsh/minimal-router/activity.jsonl`，**只留最近 200 条**，超过 256KB 自动重写尾部
- 写盘失败只影响这条日志，不影响主流程

### 新增 · `route_activity` 工具
```
route_activity()                    # 最近 20 条
route_activity({ kind: "deny" })    # 只看被拦下的调用
```
返回 `summary`（人话汇总）+ `events`（最新在前）。`route_status` 里也带了 `activity` 与 `recentActivity`（最近 5 条），不调工具也能瞥一眼。

### 重构
- `DEFAULT_STAGES` / `STAGE_ORDER` 搬到 `lib/stages-default.js`（纯数据，让入口文件回到 1200 行守卫线内）
- 工具表从 9 个变 11 个（新增 `route_use`、`route_hint`、`route_activity` 在文档里补齐）

### 测试
- 312 → **320**（activity 8）

## [1.16.0] — 2026-10-31

三个"更聪明"的能力，**全部零额外请求**（不调模型，不发第二遍上下文）。

### 新增 · 语义打分路由（`lib/intent.js`）
- 关键词没命中时，用本地字符统计（CJK 二元组 + 拉丁词）给每个阶段打画像分
- **领先不够就返回 null**，退回"粘住当前阶段"——宁可不动，也不猜
- 实测：`帮我把那个按钮挪一下` → `unity-ui`；`今天天气怎么样` → 不切
- 配置：`intentRouting`（默认开）、`intentMinScore`、`intentMinMargin`

### 新增 · 空转工具画像（`lib/usage.js`）
- 记录每个工具被**真正调用**过几次（`~/.dsh/minimal-router/tool-usage.json`）
- `route_status.toolUsage` 直接告诉你：有多少工具从装上到现在**一次都没用过**
- 只给建议，不自动卸载（卸载是不可逆的跨项目操作）

### 新增 · 自适应阶段（`lib/adaptive.js`，默认关闭）
- 从**最近 20 次真实调用**里学：某组占 60% 以上且 ≥6 次，才在 auto 阶段提议切换
- 仍要过成本闸门 + 迟滞（一次命中不会切）
- 配置：`adaptiveStage`、`adaptiveWindow`、`adaptiveMinCalls`、`adaptiveMinShare`

### 测试
- 288 → **312**（intent 11 + usage 6 + adaptive 7）

## [1.15.1] — 2026-10-31

把 1.15.0 留下的尾巴做完：**拦截 / 体检 / 熔断 / 降级的原因文案全部英文化**。

这三类文案只在出错时出现，但它们其实是**最该写清楚**的地方——A/B 早就证明，
精确的拒绝信息比模糊的提示更能让模型自己纠正。所以它们也必须让模型读得懂：

| 原 | 现 |
|---|---|
| `【阶段越界】当前阶段=… 请立即调用 route_stage("art")…` | `[out-of-stage] Current stage=… Call route_stage("art")…` |
| `【本地体检拒绝】第 2 行：… 请立即改写这段代码` | `[local lint] blocked — N high-risk pattern(s): line 2: … Rewrite that code before retrying` |
| `【dsh-minimal-guard 已熔断】连续 3 次…` | `[dsh-minimal-guard] circuit breaker tripped — 3 consecutive tool calls failed…` |
| `模型 x 不在已知能力表里，按不安全处理` | `model x is not in the known capability table; treated as unsafe` |

连带修了 **10 处测试断言**（它们断言的正是这些中文文案）。
两次扫描确认：`reason:` 与 `【` 开头的字符串里，**中文 = 0**。

**288 项测试**。

> 仍然保留中文的只剩：控制台警告、`route_status` / `cache_probe_report` 里的 `hint`、以及注释和文档。
> 这些要么是给人看的，要么是开发者自己读的。

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
