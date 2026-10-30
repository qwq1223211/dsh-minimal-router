# dsh-minimal-router · S1

> 一句话：**物理边界铁血，业务逻辑自由。**
> 路由只写在尾巴上；模型越界就当场拦，写死循环就当场退。
> `enforceByRestrict: true` 时额外做物理瘦身（工具 187→69，每轮省约 3 万 token）。

## 三条铁律（写死在代码里，不是配置项）

| # | 铁律 | 怎么保证 | 代码位置 |
|---|---|---|---|
| 1 | **缓存红线** | 提示只走 `systemPrompt.context()` 尾插，硬校验 ≤200 字，超了直接截断 | [lib/prompt.js](lib/prompt.js) `HINT_LIMIT` |
| 2 | **防死循环红线** | 写代码类工具执行前，本地扫描 `while(true)` / `for(;;)` / `do{}while(true)`；**循环体里没有 break/return/throw 才拦** | [lib/lint.js](lib/lint.js) `scanCode` |
| 3 | **逃生门底线** | `route_stage` / `route_status` / `route_reset` 永远放行；guard 那边也把这三个加进了白名单，两边都认 | [lib/classify.js](lib/classify.js) `ALWAYS_ALLOW` + guard 的 `exemptTools` |

## 实测账单（同一会话内相邻请求，A/B 对照）

| 指标 | 不砍（auto） | 砍完（core） | 差 |
|---|---|---|---|
| 工具数 | 187 | 69 | **-118** |
| 工具声明字节 | 147,615 | 48,837 | **-67%** |
| promptTokens（同一历史长度） | ≈402,000 | ≈370,500 | **每轮 -31,500（-7.8%）** |
| 切换那一次的额外全价 token | — | — | **仅 3,205** |

**两个反直觉的结论：**

1. **切换几乎不花钱。** 原以为改工具列表会让整个前缀缓存失效（40 万 token 全价）。实测：切的那一次仍命中 398,720 token，只有 3,205 个 token 走全价。**切换一次的成本，一轮就回本（约 1 : 10）。**
2. **省 token ≠ 省钱。** 省下的 3 万 token 里 99.9% 本来就是"命中缓存"的便宜 token，账单上的省钱没有字节数看起来那么夸张。

## 硬约束：`restrict()` 只能在会话级调用

实测在插件全局 ctx 上调 `ctx.tools.restrict()` 会被 DSH 直接拒绝：

```
tools.restrict() requires a scoped context (agent.ctx):
a context-global restriction would mask every agent
```

所以瘦身必须挂在 `agent.ctx.tools.restrict()` 上，并**按会话**分别管理。
[index.js](index.js) 的 `refreshRestriction` 负责"先拆旧、再算新"——顺序反了工具会永久消失，单元测试专门守这条。

## 免费给你的：自适应分类

工具标签从名字里自动长出来，**装新插件不用改任何配置**：

| 工具名 | 标签 |
|---|---|
| `unity_script_create` | `unity` |
| `mcp__meshy__meshy_image_to_3d` | `meshy`（组名在中间，不是 `mcp`） |
| `ui_add` | `ui` |
| `read` | `core` |

**只有"被阶段认领过"的标签才参与拦截。** 没人认领的标签一律放行——这样新装的插件不会因为"没分类"就被误杀。

## 五个阶段

| 阶段 | 允许的组 | 关键词 |
|---|---|---|
| `auto`（默认） | 全部 | —— |
| `core` | 仅基础 | 通用、基础 |
| `unity-code` | `unity` | 代码、脚本、编译、报错、unity |
| `unity-ui` | `unity` `ui` | ui、界面、按钮、布局、面板 |
| `art` | `art` `meshy` `image` | 贴图、模型、素材、美术 |
| `audio` | `audio` | 音效、音乐 |

判定优先级：**显式 `route_stage` > 用户消息关键词 > 默认 `auto`**。

## 三个工具

- `route_stage(stage)` —— 切阶段
- `route_status()` —— 看当前阶段、标签分布、工具数量、最近一次体检命中
- `route_reset()` —— 复位到 `auto`（逃生门）

## 自测

```powershell
cd C:\Users\Leo\Documents\deepseek-harness\default-workspace\dsh-minimal-router
node test/router.test.mjs
```

看到 `ALL 63 TESTS PASSED` 就是好的。

## 必须说清的三件事（别被"路由器"三个字骗了）

**1. 它不省 token。**
因为铁律 1 禁止动工具列表，所以 187 个工具、147KB 声明、34 万 token 一分不少。
**S1 解决的是"模型选错工具"，不是"前缀太肥"。** 想省 token 只有两条路，都要你点头：
- 允许 `restrict()` 过滤工具列表（付一次前缀重建）
- 元工具把工具折叠（牺牲 schema 可靠性）

**2. 只认领了 6 个标签，其余一律放行。**
现在被管的组：`unity` `ui` `art` `meshy` `image` `audio`。
`asset` `level` `perf` `save` `uikit` `lighting` `player` `enemy` `l10n` `gameplay` `uiflow` `dialogue` `quest` 这些都**没被任何阶段认领**，所以目前永远是放行的。
要管它们，就在 [index.js](index.js) 的 `DEFAULT_STAGES` 里给某个阶段的 `allow` 加上对应标签，或者新开一个阶段。

**3. `route_status` 的工具数是 153，探针记录的是 187。**
两个数不一样是因为它们统计的东西不同：`route_status` 数的是"当前会话可见的工具"（`tools.schemas()`），探针数的是"这次请求实际发出去的声明"（含 `systemPrompt.tools()` 提供的，比如技能目录）。**看省钱效果以探针的 `toolsChars` 为准。**

## 想改东西改哪里

| 想改 | 改这里 |
|---|---|
| 阶段/关键词/允许组 | [index.js](index.js) `DEFAULT_STAGES` |
| 关键词匹配优先级 | [index.js](index.js) `STAGE_ORDER` |
| 默认阶段 | [cordis.patch.yml](cordis.patch.yml) `defaultStage` |
| 体检从拦变成只警告 | [cordis.patch.yml](cordis.patch.yml) `lintMode: warn` |
| 体检规则本身 | [lib/lint.js](lib/lint.js) `scanCode` |
| 尾部提示的 200 字上限 | [lib/prompt.js](lib/prompt.js) `HINT_LIMIT` |
| 哪些工具不参与体检 | [index.js](index.js) `lintSkipTools` |

**改完代码必须做一次 `disable → enable`**（link 安装不会热更新），否则跑的还是旧代码。
