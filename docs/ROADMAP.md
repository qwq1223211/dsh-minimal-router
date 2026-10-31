# 路线图（非阻塞计划）

> 这里只放"不急但迟早要做"的事。每一条都有**触发条件**，不是许愿池。

---

## 一、拆分 `index.js`（三段）

**现状**：`index.js` 代码行 **1198**（守卫线 1200，`scripts/lint.mjs` 在 >1100 时警告、>1200 时失败）。
每次加功能都要先"腾行"，这已经是重复劳动。

**拆成三块**：

| 目标模块 | 内容 | 预计行数 |
|---|---|---|
| `lib/tools-route.js` | 6 个 route_* 工具的注册与 execute | ~350 |
| `lib/config.js` | `CONFIG_DEFAULTS` + `normalizeConfig` | ~180 |
| `lib/status.js` | `route_status` 的装配与输出 | ~250 |
| `index.js`（保留） | apply 装配、钩子接线、阶段表合并 | **< 600** |

**触发条件**：代码行进入 **>1150** 的警告区中部，或**下一次改动需要净增 >5 行**时——先拆再改，不要边撞线边加功能。

**验收**：拆完后 `index.js` < 600 行，全量测试数量与结果不变（纯搬运，不改行为）。

---

## 二、并集的去留（带缓冲，不一次删干净）

**数据来源**：`lib/activity.js` 落盘的 JSONL，看 `switch` 事件里 `to` 含 `+` 的次数。
（脚本还没写；需要时用 `scripts/analysis/` 里现有脚本的读法即可。）

**判定规则**

| 一周内并集触发次数 | 动作 |
|---|---|
| ≥ 10 次 | 保留 `@experimental`，继续观察 |
| < 10 次 | 下一版标记 `@deprecated`（**保留代码一版**，只在文档和 `route_status` 里提示将移除） |
| 再下一版 | 才删除 `lib/union.js` + `test/union.test.mjs` + `test/union-e2e.test.mjs` |

> 为什么不一次删：删代码和删测试在同一版本里发生，回滚成本最高。
> 先 `@deprecated` 一版，给一次"反悔窗口"。

---

## 三、本地小模型分类器（不排期）

接口、三保险、置信度默认值、启用条件都写在 [`LIMITS.md §2`](./LIMITS.md)。
**触发条件**：连续一周 `activity` 里"阶段已判定但 AI 调用被 deny"的比例 **> 15%**。

---

## 四、要不要给探针记录补 `stage`

**现状**：探针的 `stage` 字段一直是 `n/a` —— `lib/probe.js` 里 `ctx.get('minimalRouter')` 从来没被提供过。
后果：`activity` 之外没有"这条请求属于哪个阶段"的历史数据，很多分析做不了。

**做法**：在 `apply()` 里暴露一个只读服务（`currentStage()`），`probe.js` 的 `currentStage()` 就能读到。
**注意**：这需要在 `index.js` 里加 1~2 行 —— 所以**排在拆分 `index.js` 之后**，否则又要在红线边缘挤。
