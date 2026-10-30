# dsh-minimal-router · v1.0.0

> **Give the model only the tools it needs right now.** Fixed prefix, variable tail.
> Measured: **165 tools → 69 tools**, **131,694 → 48,837 bytes** of tool declarations per request.

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) host plugin. No build step, no dependencies.

---

## Why

DSH sends **every** installed plugin's tool schemas on **every** request. With a few dozen plugins that's 100K+ characters of tool descriptions the model re-reads even when it is just chatting.

This plugin groups tools by name, decides which group the current task needs, and (optionally) **physically removes** the rest from the request — then puts the routing hint on the **tail** of the context instead of the head, so the prefix stays cacheable.

## Numbers (same machine, same model, measured with `dsh-cache-probe`)

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

## Bring your own domain

```powershell
# ask the agent:
route_init
```

It writes `custom_stages.sample.json` containing:
- `discovered` — every tag in your environment, with counts and whether a stage claims it
- `suggestions` — one ready-to-edit stage per unclaimed tag
- `_readme` — the 5 steps

Rename to `custom_stages.json`, edit, restart the plugin. Merge order is **built-in → `custom_stages.json` → `cordis.patch.yml`**; a malformed file is ignored with a warning, never fatal.

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
