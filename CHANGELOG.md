# Changelog

All notable changes to `dsh-minimal-router`.
Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [SemVer](https://semver.org/).

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
