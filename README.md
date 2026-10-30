# dsh-minimal-router · v1.14.0

[![Tests](https://github.com/qwq1223211/dsh-minimal-router/actions/workflows/test.yml/badge.svg)](https://github.com/qwq1223211/dsh-minimal-router/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DSH-plugin-4F7CFF)](https://github.com/deepseek-ai/deepseek-harness)
[![Tools](https://img.shields.io/badge/tools%20per%20request-165%20%E2%86%92%2066-orange)](#numbers-same-machine-same-model-measured-with-dsh-cache-probe)

> **Give the model only the tools it needs right now.** Fixed prefix, variable tail.

## 30 seconds

Three commands:

```bash
# 1. install (choose the one that works for you)
dsh plugin --profile desktop add github:qwq1223211/dsh-minimal-router
#    or: tell your agent "install this plugin: https://github.com/qwq1223211/dsh-minimal-router"

# 2. reload: Settings → Plugins → toggle "Minimal Router" off and on  (a link install does not hot-reload)

# 3. verify: ask your agent to call route_status
```

What changes, measured in a fresh session (same machine, same model):

| | before | after | |
|---|---|---|---|
| tools sent per request | 165 | **66** | −99 |
| tool declarations | 131,694 B | **43,238 B** | **−67.2%** |
| promptTokens per turn | 47,885 | **25,688** | −46.4% |
| cache hit rate | — | **99.16%** | |

And the number it exists to protect — a real probe record from this machine:

```json
{
  "tools": 172, "toolsChars": 138711,
  "inputTokens": 563654, "cacheReadTokens": 5504,
  "promptTokens": 569158, "hitRate": 0.0097
}
```

`hitRate: 0.97%` means **the entire context was re-billed at full price**. Every design decision in
this plugin (`contextGuardThreshold`, `switchConfirmations`, `switchCooldownMs`, the cost gate) exists to
make that line rare. That record was produced by reloading the plugin in a long session — which is exactly
why the docs keep saying *don't install or change plugins mid-session*.

**What it does not do** (read this before installing): it does not shrink the system prompt (that is a bigger
lever), the tokens it saves are mostly cache-priced (so your bill may barely move), and it must not run
alongside another tool router. [Details](#what-it-does-not-do-avoid-misunderstandings).

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) host plugin. No build step, no dependencies.

---

## Install

### Option 1 · Just ask the agent (easiest)

Open DSH and tell the AI:

> Install this plugin for me: https://github.com/qwq1223211/dsh-minimal-router

> ⚠️ **This step is mandatory — without it the plugin looks installed but does nothing:**
> **Settings → Plugins → disable the "Minimal Router" row, then enable it again.**
> (A linked install does not hot-reload, so you would still be running the old code.)

### Option 2 · Terminal

```bash
dsh plugin --profile desktop add github:qwq1223211/dsh-minimal-router
```

> This forwards its arguments to `pnpm` inside the profile directory, and DSH additionally
> **adds the package to that profile's `dsh.profile.bundles`** and initialises the profile if needed.
>
> **Verified** (v1.12.0, brand-new profile): the install lands as a **real directory** of 34 files at
> `node_modules/@local/dsh-minimal-router` (not a link), and the profile's `package.json` gains both the
> dependency and the bundle entry. So normally you do **not** need to enable anything by hand — just go to
> Settings → Plugins and toggle the row off/on.

### Option 3 · Clone and install locally (always works)

```bash
git clone https://github.com/qwq1223211/dsh-minimal-router.git
```

Then hand the agent the **absolute path** of that folder:

> Install this directory as a bundle: `<absolute path>/dsh-minimal-router`

No registry, no package-name resolution, nothing but the clone. **If options 1 and 2 fail, use this one.**

### Verify

Ask the agent for `route_status`. A JSON payload containing `stages`, `tagCounts`, and `modelGuard`
means the plugin is installed and live.

### How the version requirement is actually evaluated

`package.json` declares `engines.dsh: ">=0.2.1-rc.4"`. The real check inside DSH is:

```js
range.trim() !== "" && semver.satisfies(runtimeVersion, range, { includePrerelease: true })
```

| Fact | Meaning |
|---|---|
| It is a **semver range**, not an exact version | Claims that the version must match exactly are wrong |
| **`includePrerelease: true`** | Prerelease hosts match too; `-rc.N` needs no special handling |
| **An empty string counts as unmet → install is refused** | Never set `engines.dsh` to `""` |

If it blocks you, DSH reports `incompatible-version` with the unmet packages, and the plugin manager
offers `set_version_exemption` for a specific runtime version (at your own risk).

Runtime data (probe history, your `custom_stages.json`) lives in **`~/.dsh/minimal-router/`**, never inside
the package — a real dependency install puts the package in a directory that gets replaced on upgrade.

## Why

DSH sends **every** installed plugin's tool schemas on **every** request. With a few dozen plugins that's 100K+ characters of tool descriptions the model re-reads even when it is just chatting.

This plugin groups tools by name, decides which group the current task needs, and (optionally) **physically removes** the rest from the request — then puts the routing hint on the **tail** of the context instead of the head, so the prefix stays cacheable.

## Numbers (same machine, same model, measured with `dsh-cache-probe`)

> **Quality gate**: 277 tests (router 177 + guard 21 + probe 31 + fuzz 12 + instrument 28 +
> install-elsewhere 8), **90.32% line coverage** (3649/4040, Node built-in V8 coverage, zero dependencies),
> plus a repo audit on every push that checks imports, entry points, `files` coverage, `engines.dsh` and
> writable paths. No test framework, no bundler, no linter package — only `node:`.

| Metric | Before (`auto`) | After (`core` stage) |
|---|---|---|
| Tools advertised | **165** | **66** (−60%) |
| Tool declaration bytes | **131,694** | **43,238** (−67.2%) |
| promptTokens per request (fresh session) | 47,885 | **25,688** (−46.4%) |
| Cache hit rate | 91.4% (2nd step) | **99.16%** |
| One-time cost of switching stage (small session) | — | ~3,000 tokens |
| One-time cost of switching stage (**500k-token session**) | — | **512,000 tokens, full price** ⚠️ |

> Measured in a **brand-new, clean session** (one system prompt, no history debt) — that is the ceiling this design actually reaches.

Also measured, and easy to miss: a long-lived session had **9 copies** of the system prompt appended (159,334 chars) versus **17,685** in a fresh session. **Starting a fresh session saved more than this plugin does.** Use both.

> Honest caveat: most of the saved tokens were already cache hits (cheap). The bill moves less than the byte count suggests. The bigger win is the model no longer staring at 165 tools while choosing one.

## Install

```powershell
# in a DSH session, ask the agent to run:
plugin_manager install_bundle target=C:\path\to\dsh-minimal-router
```

Then **Settings → Plugins → disable, then enable** the row (a linked install does not hot-reload).

## Tools you get

| Tool | Purpose |
|---|---|
| `route_stage(stage, force?)` | Switch stage |
| `route_status()` | Current stage, tag census, guard state, unclaimed groups |
| `route_reset()` | Back to `auto`, releases every restriction |
| `route_init()` | Generate `custom_stages.sample.json` from **your** real tools |

**`route_*` and `guard_*` are never blocked.** Escape hatches are a hard rule here.

## Default stages

| Stage | Allowed groups | Auto-triggered by |
|---|---|---|
| `auto` *(default)* | everything, no trim | — |
| `core` | base tools only | core / general |
| `unity-code` | unity + 13 Unity subsystems | code, script, compile, error, unity |
| `unity-ui` | unity, ui, uikit, uiflow, dialogue, quest | ui, layout, button, panel |
| `art` | art, meshy, image, asset | texture, model, sprite, mesh |
| `audio` | audio | sfx, music, audio |

Tags are derived from tool names (`unity_object_create` → `unity`, `mcp__meshy__x` → `meshy`). **Groups no stage claims are always allowed**, so a newly installed plugin is never blocked for being unclassified.

> This table looks Unity/Meshy-heavy because that is what the author works on — not because the plugin only supports game development. Swapping it for Python, data analysis, writing, or video editing takes about a minute; see the next section.

## Bring your own domain

**Easiest path: use a bundled preset.**

```text
route_init({ "preset": "python-data" })
```

It writes a ready-to-use `custom_stages.json`; reload the plugin and you are done. Bundled presets:
`python-data`, `web-dev`, `writing`, `qq-chat`.

Calling `route_init` with no arguments is the other path: scan your environment and emit a template to edit.

### The zero-config path: let the model decide what it needs this turn

**No stage table required.** The built-in `route_use` tool narrows the tool set on demand:

```text
route_use({ "groups": ["unity"], "turns": 3 })
```

It keeps the `unity` group plus the base tools, trims everything else, and **restores automatically after
3 turns** — nothing to remember to undo. `route_use({ "groups": [] })` releases immediately.

Where do group names come from? `route_status` → `tagCounts`. They are derived from tool names, so you never
define a workflow up front.

> **Why not a per-turn judging model?**
> That is one extra request per turn, with the whole context re-sent at full price. Measured here: 99.9% of
> the tokens this plugin saves are **cache-priced**, so paying one full-price request to save cheap tokens is
> a net loss. The judgement goes back to the model that is already in the context — it knows what it is doing;
> one tool lets it say so, at zero extra cost.

### Scope the report to the current session

`cache_probe_report` reports the average over all history by default. To see only this session:

```text
cache_probe_report({ "scope": "session" })
```

It returns `session` (a fingerprint — **the raw session id is never written to disk**), `sessionTotal`, and a
session-scoped `summary`.

> Measured once: `session: "8c144bfe"`, `sessionTotal: 1`, `lastHitRate: 0.0097`. That request happened right
> after a plugin reload, and **0.97% is exactly what one full-price prefix rebuild looks like**.

### Verify the hint yourself with `route_hint`

```text
route_hint({ "enabled": false })   # off for THIS session only
route_hint({ "enabled": true })    # on
route_hint()                       # query only
```

Takes effect at runtime, no reload. The hint costs 50–126 tokens per turn (~0.1% of the tool declarations),
so "the hint is expensive" is arithmetically impossible — only its **behavioural** effect is worth testing.

```powershell
# ask the agent:
route_init
```

It writes `custom_stages.sample.json` containing:
- `discovered` — every tag in your environment, with counts and whether a stage claims it
- `suggestions` — one ready-to-edit stage per unclaimed tag
- `_readme` — the 5 steps

Rename to `custom_stages.json`, edit, restart the plugin. Merge order is **built-in → `custom_stages.json` → `cordis.patch.yml`**; a malformed file is ignored with a warning, never fatal.

### Why not fully automatic?

Because **"never block the wrong tool" outranks "save the most tokens"**.

For any tool group that no stage claims, the only safe default is to **allow it**. Guessing what your brand-new tool does would sometimes guess wrong — and a wrong guess blocks you in the middle of a task, which is far worse than not saving a few thousand tokens.

`route_init` is the compromise: one scan of *your* tools, one template, about a minute of editing, then routing is automatic forever. It lists every unclaimed group with its tool count, so the decision you are confirming is a small, concrete one.

> One line: it is not lazy. Blind guessing is just more expensive than one minute of confirmation.

### If none of your tools belong to a built-in stage

That is the most common way this plugin "installs but saves nothing, silently": the built-in table claims
`unity`/`ui`/`art`/`meshy`/`image`/`audio`/`asset`, and if your machine has none of those tags, the deny list
is always empty. `route_status` now says so out loud:

```json
"stageTableUnused": true,
"stageTableHint": "内置阶段表认领的标签在你这里一个都不存在……"
```

Two ways out:

1. Run `route_init` and put **your own tags** into a stage (recommended), or
2. Give a stage `"strict": true` — it then also denies tags no stage claims:

```json
{ "defaultStage": "chat",
  "stages": {
    "auto": { "allow": ["snowluma", "snowluma-host"] },
    "chat": { "allow": ["snowluma", "snowluma-host"], "strict": true }
  } }
```

`strict` defaults to **false** (unknown tags are always allowed — never a false positive). `stages` may be an
object map **or** an array of `{ "stage": ... }` entries; both are accepted.

## Hard rules (not configurable)

1. **Dead-loop lint** — before a write-like tool runs, source is scanned for `while(true)` / `for(;;)` / `do{}while(true)` **without a `break`/`return`/`throw` in the body**. Comments and string literals are stripped first, so `grep "while(true)"` is not a false positive.
2. **Out-of-stage calls are denied** with an imperative message naming the stage to switch to.
3. **Escape hatches stay open**, always.

## Degradation guard (the important one)

The savings depend on the model supporting **in-history system prompt updates**. DSH's DeepSeek adapter declares this per model:

```js
{ id: "deepseek-flash",  systemPromptUpdate: "in-history", toolUpdate: "addition-only" }
{ id: "deepseek-v4-pro"  /* neither — equivalent to leading-only */ }
```

On a model without it, every tail change rewrites the prefix and **every step becomes a full cache miss**. So:

| | in-history | not supported / unknown |
|---|---|---|
| Tail hint | on | **off (empty string)** |
| Physical trim | on | **off** |
| Out-of-stage deny | on | on (touches no prompt) |
| Dead-loop lint | on | on |

A boxed warning is printed **once** per model. Unknown models degrade by default (**fail-safe**).

Custom / proxied models that you have verified:

```yaml
trustedModels: ['my-flash']     # precise
unsafeForce: true               # blanket, at your own risk
```

Demo it without paying for it: `simulateModel: deepseek-v4-pro`.

## Safety gate for huge contexts

Switching stage in a very long session costs a full prefix rebuild. When the last request exceeded `contextGuardThreshold` (default `100000` tokens), `route_stage` is **refused** with an explanation, and requires `force: true` to proceed.

### Cost gate: pay it back in how many turns?

Mined from **615 real probe records** (60 prefix changes), the cost profile is **bimodal**:

| Type | Count | Share of context that missed |
|---|---|---|
| Cheap | 35 | **0.2% – 1.2%** |
| Catastrophic | 11 | **98% – 99%** |

And it does not correlate with how much changed: a **98,778-byte** tool-list change cost 708 tokens,
while an **481-byte** change cost **581,830**.

Cheap is luck; expensive is risk. So the estimate assumes the worst case (the whole context at full
price) and computes:

> paybackTurns = worstCaseCost ÷ tokensSavedPerTurn (trimmed bytes × 0.3)

An automatic switch is refused when payback exceeds `switchPaybackTurns` (default **3**).
Explicit commands are exempt — if you asked for it, the accounting does not get to say no.

### Want a tool list that only grows?

```yaml
accumulateDisclosure: true
```

Once a group has been visible in this session it is never taken away, so consecutive switches differ less and
the prefix cache is more stable — at the cost of weaker trimming as a session ages. Off by default;
`route_reset` clears the accumulated set.

### Scope: before, not after

This plugin only **trims before the fact**; it does not compress history. Use `/trim`
(`dsh-command-context-trim`) or a compaction plugin for that. Cheapest order in a long session:
`/trim` first, then switch stage — the full-price rebuild then has a smaller base.

### Coexisting with other plugins

| Situation | Behaviour |
|---|---|
| Another plugin also decides in `tools/pre-execute` | **Safe.** For tools it allows, this plugin always calls `next()` and never overrides someone else's denial; it only short-circuits when it denies itself |
| Compaction / `/trim` plugins | **Recommended pairing.** Do not switch stage *while* a compaction is running — compaction reuses the prefix, and moving the tool list under it wastes the work |
| Another tool router (loadout-style) | **Do not run both.** Two plugins narrowing the same tool set is unpredictable; disable one |
| A message/QQ gate | Coexists as long as that gate also calls `next()`. If messages stop sending, turn `enforceStage` off first to bisect |

In one line: this plugin always errs toward **denying one time fewer** — if it cannot compute, it allows;
if a service is missing, it degrades; on an exception it calls `next()`.

## Configuration

```yaml
- insert:
    - id: minimal-router
      name: '@local/dsh-minimal-router'
      config:
        defaultStage: auto
        enforceStage: true
        enforceByRestrict: true        # physically trim tools
        requireInHistoryUpdates: true  # keep true when publishing
        contextGuardThreshold: 100000
```

## Tests

```powershell
node test/router.test.mjs   # 102 tests
```

Companion plugins: `dsh-cache-probe` (measures `cacheReadTokens` / prefix fingerprint) and `dsh-minimal-guard` (consecutive-error circuit breaker).

## License

MIT.
