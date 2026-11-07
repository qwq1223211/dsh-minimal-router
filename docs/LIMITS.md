# 能力边界（LIMITS）

> 这个文件只写**做不到什么**和**为什么**。数字都是本机实测，不是估计。
> 更新原则：凡是被实测推翻的说法，直接改这里，不留在别处。

---

## 一、多领域并集：`@experimental`，默认关闭

**实测代价**

| 场景 | 工具数 | 工具声明字节 |
|---|---|---|
| 未收窄（`auto`） | 272 | 232,458 |
| 单阶段（`core` + `plugin`） | 54 | **46,326** |
| 并集（`document-write+python-code`） | 154 | **134,539** |

并集是单阶段的 **约 3 倍**。对一个主打"瘦身"的插件来说，多数任务是**负收益**，所以：

```yaml
unionEnabled: false   # 默认；只在真的要跑"复合任务"时改成 true
```

**它仍然保留的原因**：当你确实需要"一边写 Python 一边排文档"时，单阶段会让 AI 撞墙一次
（吃到精确的 out-of-stage 拒绝信息，再自己 `route_stage` 切过去），并集可以省掉这一次往返。
**这是取舍，不是升级。**

---

## 二、本地小模型（Local Classifier）：本版**不写代码**

**现状核实（本机）**：没有 `ollama` 二进制、`127.0.0.1:11434` 无响应、无任何本地推理进程、
profile 里也没有本地模型插件。**DSH 自己不会下载模型**；要自动拉取需要装插件（社区有
`dsh-local-ai` 之类）或手动 `ollama pull`。

**为什么本版不写**：连"关键词判错"的频率都还没有数据（探针的 `stage` 字段至今是 `n/a`，
因为路由器没把服务暴露给探针）。在**未被测量的问题**上加 1.5–2 GB 常驻内存 + 一个新运行时依赖，
是把工程量花在猜测上。

**接口定义（留给未来实现，不是现状）**

```
探测：GET http://127.0.0.1:11434/api/tags      超时 2s，失败则本进程内不再重试
判定：POST /api/generate { model, prompt, format:'json', stream:false }   超时 400ms
必须返回：{ stage: string, confidence: number }
三保险：
  1. 规则优先   —— 关键词命中就不问模型
  2. 置信度门槛 —— confidence >= 0.75 才采纳（初始默认值，可配置 localMinConfidence）
  3. Fail-open  —— 超时/异常/低置信 → 回退 auto（全开放），绝不误杀
记录：{ provider:'local'|'keyword', latencyMs, model } 写入 activity JSONL，供事后比较
```

> `0.75` 是**初始值不是定论**：它是"宁可多回退、也不乱切"的保守起点，
> 未来按 `activity` 里 local vs keyword 的准确率对比来调；调整时必须同步更新这段文档。

**启用条件（可观测，不是拍脑袋）**

> 连续一周，`activity` 里出现"阶段已判定，但 AI 调用被 deny"的比例 **> 15%**，
> 说明判定确实在拖后腿 → 那时再实现上面的接口。

**更优的替代方向（本版不做）**：渐进式工具披露——主脑只保留一个 `search_tools`，
按需挂载工具。那是另一个量级的改造。

---

## 三、未认领即放行（基建底线，不可动摇）

- 任何**没被阶段表认领**的标签，工具**永远放行**：`decideOutOfStage` 对它是 allow
- 它**永远不进 deny 列表**，也就永远不会被物理摘掉
- **"认领"不是默认动作**：判据见 [`CLAIMING.md`](./CLAIMING.md)——只有"极窄 + 从未被调用 + 体积可观"的标签才值得认领；
  `route_status.unclaimedTags` 里的 `verdict` 三态（`claim-candidate` / `do-not-claim` / `no-data`）就是给这个判断用的
- 唯一例外：某个阶段显式写 `strict: true` —— 这是**人的显式选择**，不是默认行为
- **并集不继承 `strict`**：`synthesizeStage()` 合成的阶段没有 `strict` 字段，
  所以即使某个子阶段写了 `strict: true`，开启并集（`python-code+document-write`）也**不会**误杀未认领标签。
  这是**设计意图，不是实现巧合**——若未来有人给合成阶段加 `strict` 字段，
  `test/infra.test.mjs` 里那两条"strict 不被并集继承"会立刻变红。
- 目的：你以后装的第三方插件、以及你新写的插件，不会被路由器"因为不认识"而误杀

### `unclaimedTags` 里的 `bytes` 怎么读

`route_status` 会列出未认领标签及其体积。这个 `bytes` 是**展示值**：

- 它等于 `JSON.stringify({name, description, parameters}).length` 的累加，**精确到字节**
- 但**与模型实际看到的 token 不是 1:1**（本项目实测约 4 字节/token）
- 所以它只用于**量级判断**（"这堆没管的东西占了多少"），**不参与任何裁剪决策**
- 只在调用 `route_status` 时计算一次，**不影响每轮请求**

这条有 8 项测试钉死（`test/infra.test.mjs`，含 strict 继承与探针白名单）。

---

## 四、收窄系统够不到的东西

| 够不到的 | 原因 |
|---|---|
| 作用域注册的工具（`read`、`write`、`cordis_inspect_*`） | 它们不在 `restrictableNames` 里，`restrict()` 点不出名字，**摘不掉**；也不出现在 `route_status` 的组清单里 |
| 未认领标签 | 按第三条，**故意不摘**（宁可少省，不误杀） |
| `run_code` | DSH 保留名，写进 allow/deny 会直接抛错 |
| 子代理请求里的共享工具表 | deny 按本会话注册表算，restrict 作用在更大的共享表上（实测 238 − 118 = 120，而请求里是 154）；**只有 `cache_probe_report` 的数字是真的** |

---

## 五、探针的职责边界：只量体积，不追责

探针记录**只有**：`messages / tools / toolsChars / systemChars / systemMessages / prefixSig / tokens`。

**它不记录、也不会去猜**"是哪个插件改了系统提示词"。那是下游排查的事，不是路由器的职责。
有 1 项测试断言探针记录里不存在 `plugin` / `attribution` / `source` 之类的归因字段。

体积变大时，`route_status` 会把**未认领标签 + 它们的字节数**列出来，交由人决定
（要不要写 `custom_stages.json` 把它们管起来），插件**不擅自裁剪**。

---

## 六、切换一次的真实成本（2026-11-07 实测）

新会话里从 `auto` 显式切到 `unity-ui`，用 `cache_probe_report` 前后对比：

| 指标 | 切换前（auto） | 切换后（unity-ui） | 变化 |
|---|---|---|---|
| 实际发给 API 的工具数 | 270 | 172 | **−98** |
| `toolsChars` | 237,350 | 120,540 | **−116,810（−49.2%）** |
| 折算 token/轮 | — | — | **≈ −35,043** |
| `prefixSig` | `830e3259` | `c73cd0e2` | 变了（前缀重建） |
| 重建那一轮的实际成本 | — | **60,045** token | 不是最坏估计的 97,189 |

### 由此修正了成本模型（v1.19.7）

旧公式把一次性支出按**收窄前**的整段上下文估：
`97,189`；而重建时发出去的是**收窄后**的工具表，真实值 `60,045`。
两者之差 ≈ 每轮省下的量（`97,189 − 35,043 = 62,146`）。

所以成本项改为 `max(0, 上下文 − 每轮省下) × 重建比例`。修正后回本轮数
从 **2.78** 变成 **1.77**，与实测的 **约 1.7 轮** 一致。

> ⚠️ `route_status.estimatedAdvertised = 141` 与探针的 `172` 差 **31** 个，
> 是 base 工具（`route_*` / `guard_*` / `cache_probe_*` / `task_*` 和 core）——
> 它们不受收窄影响，路由器也数不进自己的 catalog。**不要拿 141 和 270 直接相减**。

