---
name: aisubsidy-measure
description: Measure what your AI coding subscriptions actually give you. Detects which plan you are on from local credential files, reads the token counts Claude Code, Codex and Grok CLI already write to disk, prices them at the vendor's own rates, and offers to submit the anonymised result to the aisubsidy catalogue. Use when the user asks what their Claude Code / Codex / Grok plan is worth, whether a subscription pays for itself, how much they would pay on the API instead, whether they have hit their usage cap, or asks to contribute a measurement to aisubsidy.
---

# Measure an AI coding plan

No vendor publishes how many tokens a subscription buys. Anthropic sells Pro,
Max 5x and Max 20x without saying what 1x is. The only way to find out is to
read what the agents already write to disk.

Almost everything here is readable. **Do not ask the user a question you can
answer from a file**, and do not infer a plan from the size of the spend: that
reasoning runs backwards and it has already produced a wrong answer once.

## 1. Which plan are they on

Three vendors, three hiding places. All three are exact reads, no inference.

**Claude** is in `~/.claude.json` under `oauthAccount`. Two fields decide it:

| `organizationType` | `organizationRateLimitTier` | plan id |
|---|---|---|
| `claude_max` | `default_claude_max_5x` | `claude-max-5x` |
| `claude_max` | `default_claude_max_20x` | `claude-max-20x` |
| `claude_pro` | anything | `claude-pro` |

**Codex** is a JWT in `~/.codex/auth.json` at `tokens.id_token`. Split on `.`,
base64url-decode part 2 (`-`→`+`, `_`→`/`, pad to a multiple of 4), parse. The
claim is namespaced:

```js
JSON.parse(Buffer.from(id_token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"), "base64"))
  ["https://api.openai.com/auth"].chatgpt_plan_type   // "free" | "plus" | "pro" | "prolite"
```

**Grok**: `~/.grok/auth.json` decodes to only `tier: 1`, which is useless
because nothing says whether 1 means SuperGrok or Premium+. Use
`~/.grok/logs/unified.jsonl` instead: the CLI polls a billing endpoint every 30
seconds and each reply ends `"subscriptionTier":"SuperGrok"`. That is the vendor
naming its own plan.

Match against the ids at <https://aisubsidy.pages.dev/api/plans>.

## 2. Where the token counts live

| Agent | Path | Shape |
|---|---|---|
| Claude Code | `~/.claude/projects/<slug>/<session>.jsonl` | one row per turn; `message.usage` has `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`, and `message.model` |
| Codex | `~/.codex/sessions/<y>/<m>/<d>/rollout-*.jsonl` | `token_count` events; `payload.info.total_token_usage` is **cumulative per session** |
| Grok CLI | `~/.grok/sessions/<enc-cwd>/<id>/updates.jsonl` | `sessionUpdate: "turn_completed"` with `usage.modelUsage` and **`costUsdTicks`** |

**Four traps. Each one silently changes the answer by a large factor.**

- Claude Code logs local synthetic turns as `model: "<synthetic>"` with zeroed
  usage. Skip them or they appear as an unpriced model.
- Codex `input_tokens` is **inclusive** of `cached_input_tokens`. Subtract, or
  the cached read is counted twice.
- Codex `total_token_usage` is cumulative per session, so take **only the last**
  `token_count` event per file.
- Grok usage is cumulative **within a `prompt_id`** and resets on the next
  prompt. Group by `prompt_id` and keep the max row per group. Summing every row
  counts the same tokens four or five times over. `inputTokens` is also
  inclusive of `cachedReadTokens`.

**Grok is the best evidence of the three** because `costUsdTicks` is xAI pricing
its own traffic rather than your rate table applied to a token count. A tick is
`1e-9` USD. That scale is not declared anywhere, so verify it rather than trust
it: at `1e-9` a 7.4M-token run costs $12.90, a blended $1.75/M, which is right
for a frontier model whose tokens are mostly cache reads. At `1e-8` it implies
$17/M, more than the undiscounted output rate and therefore impossible.

## 3. Pricing

Rates in USD per million tokens. Update from the vendor's own page, never from a
comparison blog.

```js
const P = {
  "claude-opus-5":   { in: 5,   out: 25,  v: "anthropic" },
  "claude-fable-5":  { in: 10,  out: 50,  v: "anthropic" },
  "claude-sonnet-5": { in: 3,   out: 15,  v: "anthropic" },
  "claude-haiku-4-5":{ in: 1,   out: 5,   v: "anthropic" },
  "gpt-5.6-sol":     { in: 5,   out: 30,  v: "openai" },
  "gpt-5.6-terra":   { in: 2,   out: 12,  v: "openai" },
  "gpt-5.6-luna":    { in: 0.2, out: 1.2, v: "openai" },
};
// Anthropic: cache writes 1.25x input, cache reads 0.1x input.
// OpenAI: cached input 0.1x, cache writes at the plain input rate.
// Grok: do not use a rate table, use costUsdTicks * 1e-9.
const C = { anthropic: { w: 1.25, r: 0.1 }, openai: { w: 1, r: 0.1 } };
```

**Quote the dollar figure, never the token count.** Cache reads are routinely
98% of the tokens and a tenth of the input rate. A real reading: 18.5 billion of
Opus's 18.8 billion tokens were cache reads, $9,260 of its $12,105. A headline
saying "24 billion tokens" is true and tells the reader nothing.

## 4. Did they hit the cap

This is the load-bearing field. A plan measured only by people who never reached
the limit reads as far worse value than it is. Two of the three can be read.

**Codex reports it directly.** Every `token_count` event carries a `rate_limits`
block:

```json
"primary": { "used_percent": 19, "window_minutes": 10080, "resets_at": ... },
"plan_type": "plus"
```

That also makes Codex's ceiling computable without saturation: tokens burned in
the window divided by the fraction of the window they represent gives the whole
allowance. Group by plan **and** `window_minutes` (an account can change tier,
and OpenAI has run a 5h and a weekly window at different times). Ignore windows
under 5%: `used_percent` is a whole number, so dividing by a small one turns
rounding into the answer.

**Grok reports it too.** `~/.grok/logs/unified.jsonl` logs
`creditUsagePercent` on every billing poll, with a `currentPeriod` giving the
window. Do not read a single value: the field name could plausibly mean a
config knob. Parse every occurrence in time order. A reading that walks
1 → 4 → 13 → 42 → 87 → 100 and then pins at 100 is a fuel gauge, and it is empty.

**Claude does not report it.** There is no reliable local signal. Ask, and take
`unsure` for an answer.

**A false positive to expect:** grepping Claude logs for rate-limit strings
matches WebSearch result text quoted into transcripts, and matches the current
session's own file, since your tool calls land in the log you are searching.
Open every hit before believing it.

## 5. What cannot be measured

Do not waste turns here. Checked and confirmed empty: Kimi (`~/.kimi/sessions`
holds 85MB of `wire.jsonl` with no usage fields at all), Gemini (`logs.json` is
2 bytes), Copilot (process logs only), Cursor (`ai-tracking` is a 321MB SQLite
counting accepted lines, not tokens), Windsurf, Codeium and Antigravity
(extension trees with no session accounting).

## 6. Report it back

Give the dollar figure, the per-window distribution, the plan you detected and
where you read it, then the multiple against the plan price.

State the weaknesses, because they are real and a reader who finds them later
stops trusting the number:

- **The window is file mtime, not timestamps.** A session file touched inside
  the window contributes *all* of its turns, including older ones, and a stale
  file is excluded entirely even if half its turns fall inside. The direction of
  that error is not knowable without re-cutting on timestamp.
- **5h buckets are anchored on the first turn found**, not on the vendor's
  actual reset boundaries, so a peak window figure is indicative only.
- **Claude and Codex are your rate table applied to their counts. Grok is the
  vendor's own arithmetic.** If a cache multiplier is stale, the first two move
  with it.
- **Subagent turns are included.** Correct, since they bill against the plan,
  but this is not a measure of the user's typing.
- **List rates are a counterfactual**: what the API would have charged for this
  exact traffic. Not the vendor's cost, not their margin.

## 7. Ask before sending anything

Confirm the detected plan with the user rather than assuming your read is right,
and get `hit_cap` for anything you could not read.

Then **show the exact JSON and wait for a clear yes.** It carries model names
and token counts only: no paths, no project names, no prompts, no code. Do not
send on an ambiguous answer.

## 8. Submit

```sh
curl -X POST https://aisubsidy.pages.dev/api/submit \
  -H 'content-type: application/json' --data @measurement.json
```

Schema `aisubsidy/measurement/1`, requires `schema`, `plan_id` and `agents`;
optional `window_hours`, `usd_window_median`, `usd_window_p90`,
`usd_window_max`, `active_windows`, `hit_cap`, `note`, `probe_version`. One
submission per plan, so a machine on three vendors sends three.

Nothing posted changes the site directly. Submissions queue for review and a
figure moves into the catalogue by pull request once several independent
measurements agree, because one person's month is a sample of one. Running
totals: <https://aisubsidy.pages.dev/api/measurements?group=plan>.
