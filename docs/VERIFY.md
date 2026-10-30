# 真机验证清单

> 目的：把「本机测不出来」的那部分，交给一台**别人能复现**的机器跑一遍。
> 每条都写清：**要验证什么 → 怎么跑 → 看哪几个字段 → 什么算通过**。
>
> 先说清一件事：**「干净」不是指硬盘，是指这次验证要观察的那个变量之前有没有被污染。**
> 对不同的目标，条件正好相反——详见下面的表。

---

## 0. 哪种机器能验证什么

| 想验证的 | 需要什么样的机器 | 说明 |
|---|---|---|
| **A. 自动安装路径**（`dsh plugin add` → pnpm store） | **必须没装过** | 手动复制 / `link:` 装的机器证明不了 pnpm 那条路 |
| **B. `files` 是否够、入口能否解析** | **必须走真实安装** | 手动复制会把整个目录抄过去（含 `files` 没列的），反而掩盖问题 |
| **C. 数据是否落在 `~/.dsh` 而不是包里** | 任意 | 看一眼 `file` 字段即可 |
| **D. 真实宿主的 `restrict` / `systemPrompt` 语义** | 任意真实机器 | 换个 provider / 模型，证据更强 |
| **E. 降级保护（fail-open）** | 任意，但**模型要在能力表外** | 非 DeepSeek 官方路由最合适 |
| **F. 升级不丢数据（旧版 → 新版）** | **必须是装过旧版的机器** | 干净机器没有旧数据可迁 |
| **G. 锁不死（逃生门）** | 任意 | 收窄到最窄，再试着救回来 |

### 不用新机器的技巧

**新建一个 profile 就是干净的**：

```bash
dsh plugin --profile fresh add github:qwq1223211/dsh-minimal-router
```

新 profile 没有任何历史状态，而 pnpm 会把包装进 `~/.pnpm-store` 再硬链到
`profiles/fresh/node_modules/.pnpm/<hash>/...` —— **这正是我们担心的那个环境**
（路径带 hash、升级会被整体替换）。验完删掉这个 profile 即可，不影响日常那个。

---

## A. 自动安装（干净 profile）

> **已在本机真实验证过一次（v1.12.0）**：全新 profile + `dsh plugin add github:...`，
> 装出来是 `node_modules/@local/dsh-minimal-router` 这个 **34 个文件的真实目录**（不是 link），
> profile 的 `package.json` 自动加上了依赖**和** `dsh.profile.bundles` 条目，
> 探针数据/阶段表都在 `~/.dsh/minimal-router/`（包外），`apply` 不往包里写任何文件，注册 10 个工具。
>
> 装完想自己复核，跑一条命令：
>
> ```bash
> node scripts/verify-installed.mjs <profile名>
> ```
>
> 它会检查：文件齐不齐、入口能否 import、`inject` 是否只依赖 tools、
> 写盘路径是否在包外、`apply` 有没有往包目录写东西、10 个工具是否都注册上。

```bash
# 1) 装
dsh plugin --profile fresh add github:qwq1223211/dsh-minimal-router

# 2) 在 fresh profile 里启动，然后对 AI 说：
调 route_status
```

**通过标准**

| 字段 | 期望 |
|---|---|
| 返回了 JSON | `stages` / `tagCounts` / `modelGuard` 都在 |
| `degraded` | 若是非官方模型，`true` 属于**正常**（见 E） |
| `toolCount` | 接近你实际工具数（不是 0，也不是 9） |

**失败特征**：`cannot find module`（`files` 少列了东西）、
`incompatible-version`（`engines.dsh` 不满足）、插件列表里**根本没有这一行**。

---

## B. 数据落在用户目录（任意机器）

对 AI 说：

```text
调 cache_probe_report
```

**看一个字段：`file`**

| 结果 | 判定 |
|---|---|
| `~/.dsh/minimal-router/usage.jsonl`（或 `C:\Users\<你>\.dsh\minimal-router\usage.jsonl`） | ✅ 通过 |
| 任何包含 `node_modules` / `.pnpm` 的路径 | ❌ 失败（升级会丢数据，请开 issue） |
| 插件目录里（如 `.../dsh-minimal-router/data/usage.jsonl`） | ❌ 失败 |

---

## C. 升级不丢数据（**必须是装过旧版的机器**）

> **已用端到端测试覆盖**（`test/migration.test.mjs`，进 CI）：
> 子进程把 `HOME` 指到临时目录 → 搭出真实的"旧版布局"（包目录里带 `data/usage.jsonl`）→
> 从旧包 import → 断言数据出现在 `~/.dsh/minimal-router/`、**条数一条不少**、重复加载不覆盖。
> 但**真机升级**仍然值得跑一次：它能发现测试伪造不出来的东西（权限、盘符、真实旧数据格式）。

这是唯一一件**干净机器做不了**的验证，也是最该做的——旧版的探针数据写在**包目录里**，
新版加了一次性搬家逻辑（`resolveProbeDataFile`）。

```bash
# 1) 先记下旧数据有多少条
#    在旧版插件目录里： data/usage.jsonl 的行数

# 2) 把插件升级到当前版本（重装或更新），重载插件
#    设置 → 插件 → 关掉再打开

# 3) 对 AI 说：
调 cache_probe_report
```

**通过标准（三条全中才算过）**

| 检查 | 期望 |
|---|---|
| `file` 字段 | 已经指向 `~/.dsh/minimal-router/usage.jsonl` |
| `total`（或记录数） | **≥ 旧文件的行数**（一条都没丢） |
| 旧位置 | 即使还在，也不该再被写入 |

---

## D. 真实宿主的工具裁剪语义（任意真实机器）

```text
1. route_stage({"stage":"<某个会砍工具的阶段>"})
2. route_status
```

**通过标准**

| 字段 | 期望 |
|---|---|
| `restrictEffective` | `true`（如果 `degraded: true` 则必然是 `false`，见 E） |
| `registeredToolCount` | 大于 `estimatedAdvertised` |
| `restrictedToolCount` | **> 0** |
| 被砍掉的工具 | 模型**看不到**它们（而不是"调用时报错"） |

**这一条为什么重要**：物理裁剪是"从工具表里移除"，而拒绝是"调用时拦截"。
两者在真实宿主里的表现不同，只有真机能区分。

---

## E. 降级保护（非官方模型）

用任何**不在能力表里**的模型（自建代理、第三方兼容接口都算）：

**通过标准**

| 现象 | 期望 |
|---|---|
| 控制台 | 有一个醒目警告框，说明该模型不支持 in-history |
| `route_status.degraded` | `true` |
| `hintEffective` / `restrictEffective` | 都是 `false`（**自动关掉，避免烧缓存**） |
| 越界拦截 / 死循环体检 / 探针 | **仍然工作**（这几项不碰 prompt） |

**这一条已经有一台真实机器验过**：`bailian / deepseek-v4.1-flash-1017` 上
`degraded: true`、`restrictedToolCount: 0`，插件没有崩、没有报错、只是不省。
这就是 fail-open 该有的样子。

---

## F. 锁不死（逃生门）

故意把工具收到最窄，再试着救回来：

```text
1. route_use({"groups":["不存在的组"]})
2. 随便调一个工具 → 应该被摘掉
3. 调 route_reset      ← 必须仍然可调
4. 再套一层：给某个阶段加 "strict": true，重启插件
5. 调 route_status / cache_probe_report / guard_reset   ← 必须都还能调
```

**通过标准**：第 3、5 步里的工具**一个都不能消失**。
`route_*`、`guard_*`、`cache_probe_*`、`route_use`、`route_hint` 都在硬编码白名单里，
任何阶段、任何收窄都不该摘掉它们。

**如果这条挂了**：直接关掉插件就能立刻恢复（限制随插件消失），然后开 issue。

---

## 报告模板（开 issue 时贴这个）

```text
- 插件版本：
- DSH 版本（dsh --version）：
- Node 版本：
- 平台（Windows / macOS / Linux / WSL）：
- provider / model：
- 安装方式：dsh plugin add / install_bundle / link / 手动复制

route_status 关键字段：
  stage=            degraded=
  toolCount=        registeredToolCount=    restrictedToolCount=
  enforcedByRestrict=   hintEffective=       restrictEffective=
  stageTableUnused=

cache_probe_report：
  file=
  total=

复现步骤：
1.
2.
3.
```

**先自查三件事**（能解决 80% 的「装了没效果」）：

1. 装完有没有 **设置 → 插件 → 关掉再打开**？
2. `degraded` 是不是 `true`？（模型不在能力表 → 自动降级，瘦身会关）
3. `stageTableUnused` 是不是 `true`？（阶段表和你的工具对不上 → 跑一次 `route_init`）

---

## 本机**验证不了**的三件事（别声称验证过）

1. DSH loader 如何解析 `cordis.patch.yml`（在 `app.asar` 里，能读不能执行）
2. `restrict()` / `systemPrompt.context()` 的**宿主实现**（测试里的假宿主只保证我们调用方式对）
3. pnpm 真装一次后包落在哪、可不可写（需要网络 + 一次真实安装）

**这三件事只有「装到一台机器上跑一遍」才能确认。**
