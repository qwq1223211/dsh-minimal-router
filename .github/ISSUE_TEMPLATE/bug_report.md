---
name: Bug 报告
about: 装了没效果 / 工具被误拦 / 数字对不上
title: '[bug] '
labels: bug
---

## 先说清楚是哪一类

- [ ] 装了但完全没效果（`restrictedToolCount` 一直是 0）
- [ ] 工具被误拦（明明该能用）
- [ ] 数字对不上（`hitRate` / `promptTokens` 反常）
- [ ] 插件加载失败
- [ ] 其它

## 环境

- DSH 版本（`dsh --version`）：
- Node 版本（`node --version`）：
- 平台（Windows / macOS / Linux，WSL 请注明）：
- 插件版本（`package.json` 里的 version）：
- 当前模型 / provider：

## 请贴 `route_status` 的输出

它会告诉我们绝大多数原因。**请务必贴全**（尤其这几个字段）：

```json
{
  "stage": "...",
  "degraded": true/false,
  "restrictedToolCount": 0,
  "stageTableUnused": true/false,
  "hintEffective": true/false,
  "restrictEffective": true/false
}
```

先自查三件事（能解决 80% 的"没效果"）：

1. 装完有没有 **设置 → 插件 → 关掉再打开**？（不重载跑的还是旧代码）
2. `degraded` 是不是 `true`？（模型不在能力表里 → 自动降级，瘦身会关）
3. `stageTableUnused` 是不是 `true`？（阶段表和你的工具对不上 → 跑一次 `route_init`）

## 复现步骤

1.
2.
3.

## 期望 / 实际

期望：
实际：
