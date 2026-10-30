# Changelog

All notable changes to `dsh-minimal-router`.
Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [SemVer](https://semver.org/).

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
- Unity / Meshy stage definitions ship as defaults even though most users will not need them — edit `custom_stages.json`.
