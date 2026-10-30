# 架构说明（给维护者看）

> 目标读者：三个月后的自己、以及想提 PR 的人。
> 一句话：**所有决策都在 `lib/` 里，`index.js` 只负责装配和持有会话状态。**

## 1. 模块分层

```
index.js                    装配层：读配置、注册工具、持有 per-session 状态、订阅事件
├── lib/classify.js         纯函数：工具名 → 标签、越界判定、deny 列表
├── lib/stage.js            纯函数：关键词识别、阶段状态机、切换仲裁器（迟滞/冷却/时间窗）
├── lib/prompt.js           纯函数：渲染尾部提示（硬上限 + 截断）
├── lib/lint.js             纯函数：死循环/递归的本地扫描
├── lib/cost.js             纯函数：切换成本/收益/回本月数
├── lib/model-guard.js      能力查表 + fail-safe 降级判定
├── lib/stages-config.js    custom_stages.json 的读取/校验/合并 + 内置示例
├── lib/tools-dynamic.js    三个轻量工具的定义（reset / use / hint）
├── lib/guard.js            熔断子系统（独立 apply）
└── lib/probe.js            探针子系统（独立 apply，写 JSONL）
```

**判据**：能在纯函数里表达的逻辑，一律不在 `index.js` 里写。
`index.js` 越接近"只做装配"，可测性越高——现在 241 项测试里 177 项是纯逻辑 + 集成。

## 2. 会话状态：一律按 key 隔离

所有可变状态都是 `Map<key, ...>`，`key = agent.id`（没有 id 时用 `WeakMap` 给唯一键）：

| 状态 | 用途 |
|---|---|
| `state` | 当前阶段、命中来源、是否粘住 |
| `restrictions` | 当前 restrict 的 dispose + 签名 |
| `switchArbiter.states` | 迟滞计数、上次切换时间 |
| `disclosedTags` | 累积披露：本会话露过面的组 |
| `dynamicGrants` | `route_use` 的临时收窄 + 剩余轮数 |
| `hintOffSessions` | 关掉提示的会话 |
| `promptTokensBySession` | 上次请求的真实上下文长度（闸门用） |

**不变量**：任何跨会话共享的可变状态都是 bug。匿名 agent 曾经共用一个 `__global__`
槽位，导致两个窗口互相覆盖——已修，并有两项测试守着。

## 3. 一次请求经过哪些地方

```
用户发消息
  └─ agent/inbox/claimed
       ├─ 闸门 0：route_use 的轮数到期 → 自动放开
       ├─ 闸门 1：上下文 > 阈值 → 拒绝一切会改工具表的切换（记账 lastBlockedSwitch）
       ├─ 闸门 2：成本闸门（自动切换才过，显式命令豁免）
       ├─ 闸门 3：迟滞 + 冷却 + 时间窗
       └─ 命中 → state 变更 → refreshRestriction()

模型调用
  └─ llm/stream（瀑布流，旁听）
       ├─ 记录 usage → promptTokensBySession（闸门的输入）
       ├─ 到阈值 80% → 一次性提前预警
       └─ 把下游 iterable **原样**返回（不消费、不改写、不 await）

工具执行前
  └─ tools/pre-execute（瀑布流）
       ├─ 逃生门 ALWAYS_ALLOW → 直接 next()
       ├─ 本地体检 → deny / warn
       ├─ 阶段越界 → deny（给出精确修复指令）
       └─ 放行 → next()（绝不自己返回 allow 盖掉别人）

工具执行后
  └─ tools/result → 熔断器计数

上下文组装
  └─ systemPrompt.context() → 尾部提示（每步重算，≤200 字）
```

## 4. 四条不能破的约束

1. **逃生门在最前面**：`ALWAYS_ALLOW` 先判，任何规则都不能拦它。
   曾经探针工具不在名单里，一开 `strict` 就把诊断工具自己藏没了。
2. **未知一律放行**：没被任何阶段认领的标签 → 放行。`strict: true` 才反转。
3. **算不准就放行**：任何 try/catch 的 catch 分支都是"放行 / 降级"，不是"拦"。
4. **尾部提示 ≤ 200 字**：硬截断，且只列可用组——列禁止组会被截断误导模型（实测过）。

## 5. 为什么"切换"这么小心

实测（615 条探针记录、60 次前缀变化）：切换成本是**双峰**的，
35 次只miss 0.2%~1.2%，11 次 miss 98%~99%，且与改动字节数无关。

所以：迟滞（连续信号 + 时间窗）、冷却（60 秒，实测 71% 的相邻切换在 60 秒内）、
成本闸门（按最坏情况估，回本 > 3 轮就不切）。**宁可少切，不赌一次全价重建。**

## 6. 数据从哪来

- `~/.dsh/minimal-router/usage.jsonl`：探针记录（2MB 轮转）
- `_tools/*.mjs`（工作区，未入库）：一次性分析脚本，产出 README/CHANGELOG 里的数字
- **所有对外数字都必须能由这些脚本复现**；测不了的就写"未验证"，不许估。
