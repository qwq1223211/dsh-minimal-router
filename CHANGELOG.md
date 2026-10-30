# Changelog

All notable changes to `dsh-minimal-router`.
Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [SemVer](https://semver.org/).

## [1.9.0] — 2026-10-31

The four items from a self-audit: one bug that could burn money with a single sentence, three
data-driven refinements, and a regression baseline so the savings cannot silently rot.

### Fixed — negation was read as a command (P0)

`isExplicitSwitch("别切到美术")` returned **true**. Since an explicit command bypasses both the hysteresis
and the cost gate, a user saying **"don't switch to art"** would switch immediately — at full price, in the
most expensive session. Same for `不要切换到 art`, `先不切到 core`, `don't switch to art`.

A negation immediately before the switch phrase now cancels it; a sentence containing both
(`"别切到美术，切到 core"`) still counts as a command. 4 tests.

### Changed — hysteresis numbers now come from data (P0)

Analysed the gaps between **88 real switches** (`_tools/analyze-switch-gaps.mjs`):

| | gap |
|---|---|
| P25 | 2.0 s |
| median | 9.0 s |
| P75 | 81.1 s |
| P90 | 433 s |

**43% of adjacent switches happened within 5 s, 71% within 60 s** — that is the flapping, quantified.

- `switchCooldownMs` **120 s → 60 s**: covers the ≤60 s flapping mass without making real task switches wait
  an arbitrary two minutes.
- New `switchConfirmWindowMs` (**5 min**, above measured P75): two keyword signals further apart than this are
  a new task, so the confirmation count restarts. Previously "two consecutive signals" had no time bound — the
  same word an hour later still counted as a confirmation.

### Changed — cost gate knobs are configurable (P1)

`switchCostRatio` (default 1.0 = worst case) and `switchSavingsPerByte` (default 0.3, measured) were hard-coded.
Both are now config, exposed in `route_status.switchEconomics`. The measured average miss ratio is 0.465, so
anyone who finds the worst-case assumption too conservative can say so explicitly.

### Changed — the "installed but saves nothing" case now speaks up (P1)

`stageTableUnused` used to exist only inside `route_status` — you had to ask to find out you were wasting a
plugin slot. Now the first time a stage finds nothing to trim, a one-time console message explains the three
ways to fix it (preset / scan / `strict`).

### Added — integration tests and a savings baseline (P2)

- The fake runtime already modelled `restrict()` faithfully (visible schemas shrink and restore), so the
  integration assertions are real: switching to `core` leaves **6 of 13** tools with no `unity_*` present;
  switching back to `auto` **restores every tool** — the test that would have caught the
  dispose-before-compute ordering bug.
- A **byte-level savings baseline** per stage (core 54.2%, audio 46.3%, art 38.7%, unity-code 23.2%) asserts
  that trimming never regresses. A stage-table change that saves less now fails CI.

7 new tests: router 162 → **177**; **229 total**.

## [1.8.0] — 2026-10-30

Six failure modes that had never been tested, closed with 7 tests, a CI matrix, and one real fix.

### Fixed

- **Multi-agent state could collide.** `keyOf()` fell back to a single shared `'__global__'` slot for any
  agent without an `id`. Two windows (or two anonymous subagents) would then share one stage, one dynamic
  grant and one hint switch — "A switches stage and B's tools get trimmed". Anonymous agents now get a unique
  key from a `WeakMap`.

### Tested (previously unverified scenarios)

| Scenario | Result |
|---|---|
| Two agents alternating `route_stage` | Isolated stage, dynamic grant and hint switch — **test added** |
| Two anonymous agents (no `id`) | Isolated **(this is the fix above)** |
| `tools.restrict()` throws | Stage still switches; the reason is reported as `error:…`, not swallowed |
| Downstream `llm/stream` throws (429 / network) | Earlier chunks pass through, the error propagates unchanged; nothing hangs |
| 10 malformed stage configs (string, number, Chinese punctuation, junk arrays, …) | No throw; always a structured `{ ok, errors }` |
| 4 broken JSON files (truncated, Chinese punctuation, BOM, empty) | No throw |
| Another plugin denies in `pre-execute` | Our plugin calls `next()`, the other plugin's denial wins |

### CI

The matrix now runs **ubuntu / macos / windows × node 20 / 22** (6 jobs), plus a dedicated cross-platform
job asserting that the data directory is the user's home and that a **Chinese + space** path loads. Windows
alone was not evidence; this is a plugin for other people's machines.

### Docs

README now states the coexistence boundaries: safe with other `pre-execute` plugins (we always `next()`),
recommended with `/trim`, **incompatible** with a second tool router, and bisect advice for a message gate.

## [1.7.0] — 2026-10-30

The tail hint gets a runtime switch, and its cost gets measured instead of argued about.

### Added

- **`route_hint({ enabled })`** — turn the tail hint on or off **for the current session only**, at runtime, no
  reload. `route_hint()` with no argument just queries. Added to `ALWAYS_ALLOW`, so it survives even the
  narrowest `route_use` narrowing. This exists so anyone can A/B the hint on their own machine instead of
  trusting either side of the argument.
- 4 new tests (router 154; **210 total**).

### Measured: what the hint actually costs

Rendered with the real default stage table (`_tools/hint-cost.mjs`, deterministic — no sampling):

| stage | chars | ~tokens |
|---|---|---|
| auto | 71 | ~50 |
| core | 117 | ~82 |
| audio | 120 | ~84 |
| art | 138 | ~97 |
| unity-ui | 151 | ~106 |
| unity-code | 180 | ~126 |

Against a real request (137,790 bytes of tool declarations, ~900,000 tokens of context): the hint is
**0.09% of the tool declarations** and **0.01% of the context**.

Conclusion: "the injected hint is itself a cost problem" is arithmetically false. The only open question was
its **behavioural** effect, which is what the A/B below tests.

### A/B result: the old hint actively hurt, and it is fixed

Two brand-new sessions, identical task, the only difference being the hint:

| | No hint (arm B) | Hint on (arm A) |
|---|---|---|
| `unity_object_create` (forbidden in stage `art`) | **called it** | never called it |
| What came back | routing denial listing the exact fix: `请立即调用 route_stage("unity-code")` | — |
| Recovery | **switched stage, then called it again** | **gave up** ("not in my tool list") |

The old hint printed `禁止组=audio,dialogue,enemy,gameplay,l10n,level,lighting,perf 等15组` — and because the
list was truncated to 8 names, `unity` **was hidden inside "等15组"**. The model read "all these are banned",
decided the task was impossible, and stopped. The model **without** the hint just tried, received a denial
that named the tool, the current stage, the allowed groups and the exact call to make, and recovered.

So the hint was competing with the denial message and losing: the denial is precise, the truncated ban list
is not. The hint now lists **only the allowed groups** plus one universally correct escape
(`route_stage("auto")`), and shrank from 193 chars to 68–85 chars for typical stages.

Caveat stated plainly: this is n=1 per arm. It is enough to show the old wording could induce giving up, not
enough to quantify a rate. `route_hint` exists so anyone can repeat it with more samples.

## [1.6.0] — 2026-10-30

The zero-config path: task-driven narrowing without a stage table.

### Added

- **`route_use({ groups, turns })`** — narrow the visible tool set to the named groups (plus base tools and the
  escape hatch) for `turns` user turns (default 3, max 20), then restore automatically. `groups: []` releases
  immediately. Group names are the tags `route_status` already derives from tool names, so **no
  `custom_stages.json` is involved**. This answers "the plugin requires you to predefine your workflow": you
  no longer have to.
- `route_status` reports `dynamicGroups` / `dynamicTurnsLeft`; `route_stage` and `route_reset` clear any
  dynamic grant so the two mechanisms cannot shadow each other.
- 5 new tests (router 145 → 150; **202 total**), including one that asserts `route_use` and the probe tools
  survive being narrowed.

### Deliberately not implemented: a per-turn judging model

The review proposed deciding each turn's tool set with a small classifier. That is one extra request per
turn with the entire context re-sent at full price. Measured on this project, 99.9% of the tokens the plugin
saves are cache-priced — so paying one full-price request to save cheap tokens is a net loss. The judgement
stays with the model already in the context (`route_use`), which costs nothing extra.

### Also not implemented, and why

- **Defer-loading catalog anchors**: our tail hint already names the allowed and forbidden groups, capped at
  `hintMaxChars`. A second catalog block would spend prompt space to describe tools that are not in the
  prompt — the opposite of the goal.
- **Implicit LLM-generated grouping**: `route_init` already derives groups from tool names deterministically
  and offline; an LLM pass would add latency and a failure mode to a step that has neither.
- **Budget tiers**: worth revisiting only once switching cost is stable enough to model, which 1.2.0 showed it
  is not (bimodal: 0.2–1.2% vs 98–99% of context).

## [1.5.0] — 2026-10-30

Two things from a review of the ecosystem's failure modes: one real lockout bug, one cache-stability lever.

### Fixed

- **`cache_probe_report` / `cache_probe_clear` were missing from `ALWAYS_ALLOW`.** With `strict: true` (added
  in 1.3.0) the deny rule also covers unclaimed tags — and the probe tools are tagged `cache`, which no stage
  claims. So enabling strict mode **hid the diagnostic tools themselves**, and the user could no longer see
  any number explaining why nothing was being saved. That is precisely the "control plane hides itself, 221
  tools locked, no way out" anti-pattern reported for another router. The escape hatch is now checked before
  every rule, probe tools included.

### Added

- **`accumulateDisclosure`** (default `false`) — once a tool group has been visible in this session, it stays
  visible; the tool list only grows, so consecutive switches differ less and the prefix cache is more stable.
  Trade-off: trimming weakens as the session goes on, which is why it is opt-in. `route_reset` clears the
  accumulated set so you can return to strict trimming.
- The long-session warning now also suggests running `/trim` (if `dsh-command-context-trim` is installed)
  before switching, alongside "start a new session".
- 5 new tests (router 140 → 145; **197 total**), including one that asserts the probe tools survive strict mode.

### Notes on the review this came from

Several of its items were already shipped and are confirmed here rather than re-implemented: tail injection
already goes through `systemPrompt.context()` (not the system prompt — `prefixSig` stays constant across
stage switches), the soft pre-warning at 80% of the gate landed in 1.4.0, bundled domain presets landed in
1.4.0, and the "unknown is visible" default has been the design since 1.0.0.

## [1.4.0] — 2026-10-30

Three onboarding and long-session improvements, plus a correction to a claim that was circulating about
this package.

### Corrected

- **The version requirement is a range, not an exact value.** `engines.dsh` is `>=0.2.1-rc.4`; a guide in
  circulation told users it must match the host exactly. That is false. (One real caveat *does* apply:
  semver ranges with a prerelease floor cover later **releases** such as `0.2.2`/`0.3.0`, but not a
  prerelease of a different tuple such as `0.3.0-rc.1`.)

### Added

- **`examples/` presets** — `python-data`, `web-dev`, `writing`, `qq-chat`. Run
  `route_init({ "preset": "python-data" })` and it writes a ready-to-use `custom_stages.json` directly,
  instead of making every new user start from the raw scan. No more "Unity template or nothing".
- **`hintMaxChars`** (default 200, floor 40) — the tail hint was always capped at a constant; it is now
  configurable, for people who would rather have a terser prompt.
- **Proactive long-session warning** — at `contextGuardWarnRatio` (default 0.8) of the safety-gate threshold
  the plugin prints a one-time console notice telling you to start a new session, instead of staying quiet
  until a stage switch is refused.
- 4 new tests (router 136 → 140; **192 total**).

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
