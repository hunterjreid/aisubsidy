---
name: aisubsidy-measure
description: Measure what your AI coding subscription actually gives you. Reads the token counts Claude Code and Codex already write to disk, prices them at the vendor's own list API rates, and offers to submit the anonymised result to the aisubsidy catalogue. Use when the user asks what their Claude Code / Codex plan is worth, whether their subscription pays for itself, how much they would pay on the API instead, or asks to contribute a measurement to aisubsidy.
---

# Measure an AI coding plan

No vendor publishes how many tokens a subscription buys. Anthropic sells Pro,
Max 5x and Max 20x without ever saying what 1x is. OpenAI publishes weekly
message caps without saying how big a message is. The only way to find out is to
read the token counts the agents already write to disk.

This skill does that, then offers to contribute the result so the number stops
being private.

## What you are reading

| Agent | Path | Shape |
|---|---|---|
| Claude Code | `~/.claude/projects/<slug>/<session>.jsonl` | one row per turn, `message.usage` holds `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`, and `message.model` |
| Codex | `~/.codex/sessions/<y>/<m>/<d>/rollout-*.jsonl` | `token_count` events; `info.total_token_usage` is **cumulative per session**, so take only the last one per file |

Two traps worth knowing before you write any code:

- Claude Code logs local synthetic turns with `model` set to `<synthetic>` and a
  zeroed usage block. Skip them or they show up as an unpriced model.
- Codex `input_tokens` is **inclusive** of `cached_input_tokens`. Subtract, or
  you double count the cached read.

## Step 1: measure

Write this to a temp file and run it with Node 20+. It is self contained, reads
only local files, and sends nothing.

```js
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DAYS = Number(process.argv[2] ?? 30);
const CUTOFF = Date.now() - DAYS * 86400_000;
const WINDOW_MS = 5 * 3600_000;

// List API rates, USD per million tokens. Update if a vendor moves its prices.
const P = {
  "claude-opus-5":   { in: 5,    out: 25,  v: "anthropic" },
  "claude-fable-5":  { in: 10,   out: 50,  v: "anthropic" },
  "claude-sonnet-5": { in: 3,    out: 15,  v: "anthropic" },
  "claude-haiku-4-5":{ in: 1,    out: 5,   v: "anthropic" },
  "gpt-5.6-sol":     { in: 5,    out: 30,  v: "openai" },
  "gpt-5.6-terra":   { in: 2,    out: 12,  v: "openai" },
  "gpt-5.6-luna":    { in: 0.2,  out: 1.2, v: "openai" },
};
// Anthropic bills cache writes at 1.25x input and reads at 0.1x. OpenAI bills
// cached input at 0.1x and cache writes at the plain input rate.
const C = { anthropic: { w: 1.25, r: 0.1 }, openai: { w: 1, r: 0.1 } };

const price = (model, t) => {
  const p = P[model]; if (!p) return null;
  const c = C[p.v];
  return (t.input / 1e6) * p.in + (t.cache_write / 1e6) * p.in * c.w
       + (t.cache_read / 1e6) * p.in * c.r + (t.output / 1e6) * p.out;
};

function* walk(dir, depth) {
  if (depth < 0 || !existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) yield* walk(f, depth - 1);
    else if (e.isFile() && e.name.endsWith(".jsonl")) yield f;
  }
}
const fresh = (f) => { try { return statSync(f).mtimeMs >= CUTOFF; } catch { return false; } };
const blank = () => ({ input: 0, cache_write: 0, cache_read: 0, output: 0 });
const add = (a, b) => { for (const k in a) a[k] += b[k] || 0; return a; };

const agents = [];
const turns = [];   // for the window distribution

// Claude Code: per-turn usage.
{
  const byModel = new Map(); let sessions = 0, counted = 0;
  for (const f of walk(join(homedir(), ".claude", "projects"), 2)) {
    if (!fresh(f)) continue; let any = false;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      const u = r.message?.usage, m = r.message?.model;
      if (!u || !m || m === "<synthetic>") continue;
      if (!byModel.has(m)) byModel.set(m, blank());
      const t = { input: u.input_tokens || 0, cache_write: u.cache_creation_input_tokens || 0,
                  cache_read: u.cache_read_input_tokens || 0, output: u.output_tokens || 0 };
      add(byModel.get(m), t);
      const usd = price(m, t); if (usd != null) turns.push({ t: Date.parse(r.timestamp), usd });
      any = true; counted++;
    }
    if (any) sessions++;
  }
  if (byModel.size) agents.push({ agent: "claude-code", sessions, turns: counted,
    models: [...byModel].map(([model, tokens]) => ({ model, tokens })) });
}

// Codex: cumulative per session, so only the last token_count event counts.
{
  const byModel = new Map(); let sessions = 0;
  for (const f of walk(join(homedir(), ".codex", "sessions"), 4)) {
    if (!fresh(f)) continue;
    let last = null, model = "unknown";
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      const tot = r?.payload?.info?.total_token_usage ?? r?.info?.total_token_usage;
      if (tot) last = tot;
      const m = r?.payload?.model ?? r?.model;
      if (typeof m === "string" && m.startsWith("gpt")) model = m;
    }
    if (!last) continue;
    if (!byModel.has(model)) byModel.set(model, blank());
    const cached = last.cached_input_tokens || 0;
    add(byModel.get(model), {
      input: Math.max(0, (last.input_tokens || 0) - cached),   // input includes cached
      cache_write: last.cache_write_input_tokens || 0,
      cache_read: cached, output: last.output_tokens || 0 });
    sessions++;
  }
  if (byModel.size) agents.push({ agent: "codex", sessions, turns: sessions,
    models: [...byModel].map(([model, tokens]) => ({ model, tokens })) });
}

// Window distribution. Fixed buckets, not rolling: rolling windows slide across
// the same turns and overcount, so fixed gives a conservative ceiling.
let win = {};
if (turns.length) {
  turns.sort((a, b) => a.t - b.t);
  const origin = turns[0].t, buckets = new Map();
  for (const x of turns) {
    const k = Math.floor((x.t - origin) / WINDOW_MS);
    buckets.set(k, (buckets.get(k) || 0) + x.usd);
  }
  const active = [...buckets.values()].sort((a, b) => a - b);
  const at = (q) => active[Math.min(active.length - 1, Math.floor(active.length * q))];
  win = { window_hours: 5, active_windows: active.length,
    usd_window_median: +at(0.5).toFixed(2), usd_window_p90: +at(0.9).toFixed(2),
    usd_window_max: +active.at(-1).toFixed(2) };
}

const usd_total = +agents.reduce((s, a) => s + a.models
  .reduce((m, x) => m + (price(x.model, x.tokens) ?? 0), 0), 0).toFixed(2);

console.log(JSON.stringify({ schema: "aisubsidy/measurement/1", days: DAYS,
  probe_version: "skill-1", usd_total, ...win, agents }, null, 2));
```

## Step 2: report it back

Show the user, in plain language:

- what they burned at list API rates over the window
- the per-window median, p90 and max
- what that implies against their plan price, if they say which plan they are on

**Quote the dollar figure, not the token count.** Cache reads bill at a tenth of
the input rate and are routinely 98% of the tokens in a long agentic session, so
a headline token number is mostly cache and reads as absurd.

## Step 3: ask before sending anything

Two questions, and you need both answers before you can submit:

1. **Which plan are they on?** Use the exact id from
   <https://aisubsidy.pages.dev/api/plans>, for example `claude-max-20x`,
   `codex-plus`, `glm-lite`.
2. **Did they actually hit the cap in this window?** `yes`, `no` or `unsure`.
   This is the load-bearing one. Somebody who never reaches the limit has
   measured a floor, not a ceiling, and a plan measured only by light users
   reads as far worse value than it is.

Then **show them the exact JSON you are about to send and ask for a clear yes.**
It contains model names and token counts only: no paths, no project names, no
prompts, no code. Do not send it without explicit approval, and do not send it
if they decline or answer ambiguously.

## Step 4: submit

```sh
curl -X POST https://aisubsidy.pages.dev/api/submit \
  -H 'content-type: application/json' \
  --data @measurement.json
```

Add `plan_id` and `hit_cap` to the JSON from step 1 before posting. A `201`
returns an id and confirms the submission is queued.

Nothing posted changes the site directly. Submissions land in a review queue,
and a figure moves into the catalogue by pull request once several independent
measurements agree, because one person's month is a sample of one. Read the
running totals at <https://aisubsidy.pages.dev/api/measurements?group=plan>.

## If the numbers look wrong

- **Zero turns found.** The window is `--days N` against file mtime. Widen it.
- **A model priced as `null`.** Its rate is not in the table above. Add it from
  the vendor's own pricing page, not from a comparison blog.
- **An enormous token count with a small dollar figure.** That is correct and
  expected. Cache reads dominate the count and cost a tenth of the input rate.
