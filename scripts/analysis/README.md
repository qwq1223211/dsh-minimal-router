# 分析脚本（复现文档里的数字）

CHANGELOG 和 README 里的每个数字都应该能由这里的脚本重算出来。
**测不出来的就写"未验证"，不许估。**

| 脚本 | 复现什么 |
|---|---|
| `switch-cost.mjs` | 「切换成本是双峰的」：便宜档 vs 灾难档、代价与改动字节数无关 |
| `switch-gaps.mjs` | 「冷却 60 秒 / 时间窗 5 分钟」这两个默认值的来源（相邻切换的间隔分布） |
| `hint-cost.mjs` | 「尾部提示每轮 50~126 token」——确定性计算，跑一次就是最终答案 |
| `ab-compare.mjs` | **A/B 对照**：列出所有会话、比较两个会话的真实账单（协议见 `docs/AB.md`） |

## 用法

```bash
# 默认读 ~/.dsh/minimal-router/usage.jsonl
node scripts/analysis/switch-cost.mjs
node scripts/analysis/switch-gaps.mjs
node scripts/analysis/hint-cost.mjs

# 也可以指定别的数据文件（可重复）
node scripts/analysis/switch-cost.mjs --data ./old.jsonl --data ./new.jsonl
```

## 数据从哪来

探针（`cache_probe_report`）把每次请求写进 `~/.dsh/minimal-router/usage.jsonl`，
文件超过 2MB 会轮转成 `.1`。想积累足够样本：**正常用几天**，别关探针。

## 重要：数字是快照，方法才是可复现的东西

文档里引用的是 **2026-10-30 的一次快照**（615 条记录 / 60 次切换）。
数据会持续增长，所以你现在重跑得到的次数和比例**一定会和文档不同**——那是正常的。

**结论层面不变的三件事**：

1. 切换成本是双峰的（要么几 K，要么几乎整段上下文），不是平滑分布
2. 代价和"改了多少字节"基本无关（大改可以很便宜，小改可能极贵）
3. 所以成本只能按**最坏情况**估，并配一个"几轮能回本"的闸门

## 反例说明（为什么不能只看平均值）

对双峰分布取平均会得到一个**从来不会发生**的数字。
本项目实测的平均比例是 ~47%，但真实样本里几乎不存在"命中一半"的切换——
要么 ≤1.2%，要么 ≥65%。平均值在这里是个陷阱。
