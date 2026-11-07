# 运行逻辑（RUNTIME）

> 这份文档回答一个问题：**这个插件在运行时到底做了什么、按什么顺序做。**
> 所有顺序和默认值都来自代码，不是设计稿。改代码时请同步改这里。

---

## 0. 一句话

插件只有两个入口：**用户发消息时**决定用哪个阶段，**每次工具调用前**决定放不放行。
其余一切都是账本（`activity.jsonl` / `tool-usage.json` / `usage.jsonl`）。

```
用户消息 ──> agent/inbox/claimed ──> 四道闸门 ──> 切阶段 ──> refreshRestriction() ──> 工具表变窄
                                                                          │
工具调用 ──> tools/pre-execute ──> 逃生门 → 体检 → 阶段越界 → 放行/拒绝 ←──┘
```

---

## 1. 启动时（`apply()`）

按这个顺序执行，任何一步失败都不让插件加载失败：

| 步骤 | 做什么 |
|---|---|
| 1 | `normalizeConfig()`：脏数据一律回退默认值 |
| 2 | `setUnionEnabled(cfg.unionEnabled)`：并集开关，**默认 false** |
| 3 | **阶段表三层合并**：内置 `DEFAULT_STAGES` → `~/.dsh/minimal-router/custom_stages.json` → `cordis.patch.yml` 的 `stages`；后者覆盖前者。自定义文件写坏 → 整份忽略 + 告警 |
| 4 | 合并结果用 `withUnion()` 包一层（Proxy：查 `stages["a+b"]` 时现场合成 allow 并集） |
| 5 | 注册 **11 个工具**：`route_*`（7）、`guard_*`（2）、`cache_probe_*`（2） |
| 6 | 挂 3 个独立模块，各自 `try/catch`：`guard`（熔断）、`probe`（探针）、内置 `lint`（体检） |
| 7 | 挂 4 个钩子（见下） |

**4 个钩子**

| 钩子 | 触发时机 | 作用 |
|---|---|---|
| `tools/pre-execute` | 每次工具调用**前** | 体检 + 阶段越界判定，可返回 `{ kind: 'deny' }` |
| `agent/inbox/claimed` | 用户消息被认领时 | 判定阶段、过闸门、决定要不要切 |
| `llm/stream` | 每次模型请求 | **只旁听**（记模型名、探针数据），原样返回下游流 |
| `agent/created` | 新 agent 创建 | 登记作用域，供 `restrict` 使用 |

---

## 2. 用户发消息时：四道闸门

代码顺序就是拦截顺序，**任何一道 `return` 都会结束本轮判定**：

| # | 闸门 | 触发条件 | 结果 | 日志 |
|---|---|---|---|---|
| 1 | **上下文闸门** | `contextTokens > contextGuardThreshold`（默认 **100,000**）且阶段要变 | 不切，只记账 | `block by=context` |
| 2 | **成本闸门** | `costGateEnabled` 且**不是显式切换** | `payback > switchPaybackTurns`（默认 **3**）→ 不切 | `block by=cost`（带 `payback`） |
| 3 | **迟滞 + 冷却** | 阶段要变 | 需 `switchConfirmations`（默认 **2**）次确认、`switchCooldownMs`（默认 60s）冷却；显式切换不排队 | 仲裁器状态 |
| 4 | **应用** | 通过前三道 | 关键词路径走状态机；语义路径直接 `applyStage` | `switch by=keyword/intent/adaptive` |

**闸门 1 的例外**：显式 `route_stage({ stage, force: true })` 才能强行穿过。
**闸门 2 的例外**：用户亲口说“切到美术阶段”这类**显式切换**，不参与经济账。

### 阶段是怎么判出来的

```
关键词命中数 = 0  →  打分器（intentRouting，默认开）
关键词命中数 = 1  →  就是它
关键词命中数 ≥ 2  →  unionEnabled ? 打分器（可能产出 "a+b"） : 第一个命中
```

打分器只做本地字符统计，**零额外模型调用**；`minScore`（2.0）/ `minMargin`（0.25）控制松紧，
猜不准就返回 `null` → 粘在当前阶段，不做任何切换。

---

## 3. 每次工具调用前：`tools/pre-execute` 的 6 步

| 步 | 动作 | 结果 |
|---|---|---|
| 1 | **逃生门**：工具名在 `ALWAYS_ALLOW` 里 | 直接放行，**连体检都不做** |
| 2 | 使用画像：`usage.record(toolName)`；自适应信号 | 记账 |
| 3 | **本地体检**：`decideLint()` | 执行型工具命中 → `deny`；内容型（`write`/`edit`）→ 只 `warn` |
| 4 | **阶段越界**：`decideOutOfStage()` | 不允许 → `deny`，并给出“切到哪个阶段”的祈使句 |
| 5 | 反馈闭环：上次被拦后换工具继续 → 记一次“自己恢复” | 记账 |
| 6 | 任何异常 | **放行**（宁可少拦，也不堵死用户） |

### `ALWAYS_ALLOW`（永远放行，连体检都不做）

`route_stage` / `route_status` / `route_reset` / `route_init` / `route_use` / `route_hint`、
`run_code`（DSH 保留名，写进 restrict 会抛错）、`cache_probe_report` / `cache_probe_clear`、
`guard_status` / `guard_reset`。

> `task_*` **不在**这个名单里。它永远可用是因为**未认领**（见下一条规则）。

### `decideOutOfStage()` 的判定顺序（6 条）

| # | 规则 | 结果 |
|---|---|---|
| 1 | 在 `ALWAYS_ALLOW` 里 | 放行 |
| 2 | 阶段等于 `auto` | 放行（**auto 不裁剪**） |
| 3 | 阶段名不认识（被删/拼错） | 放行，别拦人 |
| 4 | 工具标签在**当前阶段**的 `allow` 里 | 放行 |
| 5 | 标签**未被任何阶段认领**且当前阶段 `strict !== true` | 放行（新插件安全网） |
| 6 | 以上都不满足 | **拒绝**，并提示该切到哪个阶段 |

> ⚠️ 规则 2 是 `stage === 'auto'` 的特判，**不是**“allow 为空就全放行”。
> 自定义一个 `allow: []` 的阶段会把所有已认领工具全裁掉（`index.js` 为此有兜底：allow 为空时退回 deny 模式，避免把工具全藏）。

---

## 4. 收窄怎么落地（`refreshRestriction`）

只有 `enforceByRestrict: true` 才会真的动工具表：

1. 算出要摘的工具：`computeDenyList()`（与 `decideOutOfStage` 用**完全相同**的判定，保证“能看到的”和“能调用的”一致）
2. 调 `agent.ctx.tools.restrict({ deny })` —— **只 deny，不用 allow**
   - 原因：allow 模式会连带隐藏 `read` / `write` / `send_message` 这类作用域注册工具（实测 4/4 会话丢失 `read`，有死锁风险）
3. `run_code` 永远排除在 deny 之外（DSH 保留名）
4. restrict 不可用 / 调用失败 → `degraded: true`、`restrictEffective: false`，只保留体检，不摘工具
5. 生效范围是**本会话的 agent 作用域**；子代理共享更大的表，真实数字以探针为准

---

## 5. 数据文件

| 文件 | 内容 | 写入时机 |
|---|---|---|
| `~/.dsh/minimal-router/activity.jsonl` | 事件台账：`switch` / `block` / `deny` / `restrict` / `grant` / `reset` / `degrade` | 每次事件 append |
| `~/.dsh/minimal-router/tool-usage.json` | 每个工具被调用过几次 | 4 秒节流落盘 |
| `~/.dsh/minimal-router/usage.jsonl` | 探针账单（每次请求一条，含 token、工具数与**阶段**） | 每次模型请求 |
| `~/.dsh/minimal-router/custom_stages.json` | 你自己的阶段与认领 | **人写**，加载时读 |
| `~/.dsh/task-guard/current.json` | 任务收窄快照（含 `keptTools` / `deniedTools`） | `task_start` / `task_end` |
| `~/.dsh/task-guard/tool-registry.json` | **全量工具清单**（239 个），任务结束也不删 | `task_start`（含 dryRun） |
| `~/.dsh/task-guard/mode.json` | `{"mode":"auto"\|"manual"}` —— **谁来决定工具表** | 徽章开关写入 |
| `~/.dsh/task-guard/request.json` | UI 发来的手动动作（`start`/`end`/`mode`） | 徽章 POST 写入 |
| `~/.dsh/task-guard/request-result.json` | 上一次动作的结果（成功/失败原因） | task-guard 消费后写 |

---

## 5.5 自动模式：谁来决定工具表（v1.21.0）

"收窄"这件事有两个决策者，用 `mode.json` 切换：

```
徽章开关（自动/手动）
      │ 写
      ▼
~/.dsh/task-guard/mode.json  {"mode":"auto"}
      │ 读（5 秒缓存）
      ▼
本插件 → 换掉尾部提示 → 模型看到"你自己决定"
```

| 模式 | 尾部提示（≤200 字硬上限） | 谁动手 |
|---|---|---|
| `manual`（默认） | `[router] stage=auto …call route_stage("unity-ui").`（152 字） | 人点按钮 / 关键词切阶段 |
| `auto` | `[router] auto mode: YOU decide the tool set. Narrow it with route_use({groups:["unity"]}) … All tools are available now.`（183 字） | **模型自己**调 `route_use` / `task_start` |

**四条约束**

1. 读不到或读坏 `mode.json` → 一律按 `manual`，**绝不会突然把控制权交给模型**
2. 5 秒缓存：切换最多 5 秒后生效，避免每轮读盘
3. 模式只改**提示词**，不强制任何行为——模型不调工具就什么都不变
4. 已经定了阶段（`stage != auto`）时，两种模式的提示完全一致

> 提示词在缓存前缀**之后**，所以切模式不会触发前缀重建。

## 5.6 UI 请求通道（手动收窄怎么落到工具表上）

浏览器调不了工具，所以徽章的动作走"文件邮箱"：

```
徽章面板 → POST /task-guard/action
              │ 写 request.json {id, action, groups, ts}
              ▼
task-guard 在**下一次 tools/pre-execute** 里消费
              │ require: 时间戳 < 60 秒、id 未被处理过
              ▼
         restrict({deny}) / dispose()  → 写 request-result.json
```

用 pre-execute 而不是定时器，是因为那是**唯一每轮都会发生、且能拿到
`agent.ctx.tools` 作用域**的位置（`restrict()` 必须作用在 agent 作用域上）。

消费端有三条保护：过期不执行、同一 id 只执行一次、失败把原因写进结果文件
（UI 上显示"上一次动作：end ✗ 当前会话没有进行中的任务"）。

---

## 6. 关键配置默认值

| 配置 | 默认 | 说明 |
|---|---|---|
| `enforceStage` | `true` | 是否拦截“越界调用” |
| `enforceByRestrict` | **`false`** | 是否**物理摘掉**工具（本机 `cordis.patch.yml` 设成 `true`） |
| `lintMode` | `deny` | `deny` / `warn` / `off` |
| `lintWarnTools` | `['write', 'edit']` | 命中也只警告的工具（内容型） |
| `costGateEnabled` | `true` | 自动切换前先算回本 |
| `switchPaybackTurns` | `3` | 回本超过这么多轮就不切 |
| `switchSavingsPerByte` | `0.3` | 字节 → token 的换算系数 |
| `contextGuardThreshold` | `100000` | 超过就拒绝任何自动切换 |
| `switchConfirmations` | `2` | 迟滞：需要连续几次确认 |
| `switchCooldownMs` | `60000` | 冷却时间 |
| `unionEnabled` | **`false`** | 多领域并集（`@experimental`） |
| `usageTracking` | `true` | 工具使用画像 |
| `adaptiveStage` | `false` | 自适应阶段（按实际使用反推） |
| `guardEnabled` / `probeEnabled` | `true` | 熔断 / 探针 |

---

## 7. 降级与失败模式

| 情况 | 表现 |
|---|---|
| `probe` / `guard` 模块加载失败 | 只告警，**路由功能不受影响** |
| `restrict` 不可用 | `degraded: true`，只做体检，不摘工具 |
| 模型不支持“系统提示追加到历史” | 降级：不插尾部提示（`requireInHistoryUpdates`） |
| 任何 hook 抛异常 | **放行** |
| 自定义阶段文件写坏 | 整份忽略 + 告警，回退内置表 |

---

## 8. 三个口径别混用

| 数字 | 来源 | 含义 |
|---|---|---|
| `registeredToolCount` / `toolCount` | 路由器注册表 | 它看得见的工具（如 239） |
| `estimatedAdvertised` | `注册数 − deny 数` | **估算**（如 141） |
| 探针的 `tools` | 真正发给 API | **权威**（如 270 → 172） |

三者差的是 **base / 作用域注册工具**（`route_*` / `guard_*` / `cache_probe_*` / `read` / `write` …），
它们不受收窄影响，路由器也数不进自己的 catalog。**做前后对比只用探针的数字。**

---

## 9. 一个完整例子（真实数据）

```
用户："帮我调一下 Unity UI"
  └─ 关键词命中 unity-ui
     ├─ 闸门1 上下文 4 万 < 10 万 → 过
     ├─ 闸门2 成本：省 35,043/轮，重建 ≈ 62,146 → 回本 1.77 轮 ≤ 3 → 过
     ├─ 闸门3 仲裁：确认 2 次后切
     └─ applyStage('unity-ui') → refreshRestriction()
        └─ deny 98 个 → 探针：工具 270 → 172，体积 237,350 → 120,540 字节（−49.2%）
```
