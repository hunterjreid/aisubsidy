# aisubsidy

**How much is your AI vendor paying for you to code?**

Nine vendors now train their own model and ship their own coding agent on an
OAuth subscription: Claude Code, Codex, Grok Build, Antigravity, GLM Coding
Plan, Kimi Code, Qwen Code, MiniMax CLI and Vibe. You pay a flat monthly fee and
burn an unknown number of tokens. Nobody publishes the number in the middle.

This is a catalogue of those plans, an API that serves it, and a probe that
reads the token counts your agent already writes to disk and tells you what you
actually consumed.

A real reading from one week of heavy Claude Code use on Max 20x:

```
At list API prices you burned $3973.06 of tokens.

Anthropic Max 20x costs $200.00/mo.
At this rate you would burn $17027.40/mo of API-priced tokens.

  subsidy multiple   85.14x
```

## Why this exists

Every plan in this catalogue is opaque, and that is the point.

Anthropic publishes Pro, Max 5x and Max 20x without ever saying what 1x is.
OpenAI publishes weekly message caps without saying how big a message is. Google
replaced a documented 1,000 requests per day with an undocumented weekly compute
cap. Z.ai counts prompts, Kimi counts calls per five hours, and one prompt fans
out to fifteen or twenty internal model calls. Not one of them tells you the
token count.

So the catalogue holds two things that can be sourced, and refuses to invent the
third:

1. **What a token costs on the open API**, per model, from the vendor's own
   pricing page. That is the denominator.
2. **What the plan costs and what the vendor says it includes**, with a source
   URL and a checked date.
3. **What you actually consume**, which nobody publishes, so the probe measures
   it from your own session logs.

Multiply the tokens you burned by the vendor's own rate, divide by what you
paid, and the subsidy falls out. No marketing page produces that number and no
amount of reading one will.

## Coding models today

Blended $/Mtok, cheapest first. Blended weights input three to one against
output, because a coding agent reads far more than it writes.

| Model | Vendor | In | Out | Blended |
|---|---|---:|---:|---:|
| Devstral 2 | Mistral | $0.40 | $2.00 | **$0.80** |
| Gemini 3.7 Flash | Google | $0.75 | $3.75 | **$1.50** |
| Kimi K2.7 Code | Moonshot | $0.95 | $4.00 | **$1.71** |
| GLM-5.3 | Z.ai | $1.40 | $4.40 | **$2.15** |
| Qwen3.8 Max | Alibaba | $2.00 | $6.00 | **$3.00** |
| Grok 4.6 | xAI | $2.00 | $6.00 | **$3.00** |
| GPT-5.6 Terra | OpenAI | $2.00 | $12.00 | **$4.50** |
| Claude Sonnet 5 | Anthropic | $3.00 | $15.00 | **$6.00** |
| Kimi K3 | Moonshot | $3.00 | $15.00 | **$6.00** |
| Claude Opus 5 | Anthropic | $5.00 | $25.00 | **$10.00** |
| GPT-5.6 Sol | OpenAI | $5.00 | $30.00 | **$11.25** |
| Qwen3 Coder Next | Alibaba | | | not sourced |
| MiniMax M3 | MiniMax | | | not sourced |

Fourteen times between the cheapest and the dearest. That spread is what makes
the subsidy question worth asking: a flat monthly fee buys wildly different
amounts of compute depending on whose model sits behind it.

## The probe

Coding agents log their own token usage. Claude Code writes per-message `usage`
blocks to `~/.claude/projects/<slug>/<session>.jsonl`. Codex writes cumulative
`token_count` events to `~/.codex/sessions/<y>/<m>/<d>/rollout-*.jsonl`. The
probe reads those, prices each model at that vendor's own list API rate, and
divides by what you pay.

```sh
node probe/probe.js                          # last 30 days, all agents
node probe/probe.js --days 7                 # shorter window
node probe/probe.js --plan cursor-ultra      # price against a specific plan
node probe/probe.js --json                   # machine readable
node probe/probe.js --submit measurement.json  # anonymised, for a pull request
```

Nothing leaves your machine. `--submit` writes model names and token counts
only: no paths, no project names, no prompts.

**Read the dollar figure, not the token count.** Cache reads bill at a tenth of
the input rate, and on a long agentic session they are 98% of the tokens and a
small fraction of the cost. A headline token number is mostly cache.

## The catalogue

```sh
node src/build.js     # validate every provider file, compile dist/catalog.json
node src/server.js    # API and web table on http://localhost:8787
```

Zero dependencies, Node 20+.

| Route | Returns |
|---|---|
| `GET /api/catalog` | everything, with derived metrics and stats |
| `GET /api/models` | one row per model, with its rate and the plans that grant it |
| `GET /api/models/:id` | one model |
| `GET /api/plans` | flat list of every plan |
| `GET /api/plans/:id` | one plan |
| `GET /api/providers` | providers without their plans |
| `GET /api/providers/:slug` | one provider with plans and API prices |
| `GET /api/stats` | counts |
| `GET /api/health` | validation result, non-empty `errors` means the data is wrong |

## The columns

**$/Mtok in** and **$/Mtok out** are the vendor's own list API rates. Blank
means no first-party rate was found, which currently applies to Qwen3 Coder Next
and MiniMax M3.

**blended** weights input three to one against output. A coding agent reads far
more than it writes, so a single comparable number should lean on the input
rate. The ratio is stated rather than hidden, and it is the sort key.

**basis** on a plan is where its quota figure came from. `published` means the
vendor states it, `derived` means it was computed from something they state,
`measured` means it came from session logs, and `unknown` means nobody has a
defensible figure yet. A blank cell is the correct output for `unknown`.

## Rules the data follows

- Every plan carries at least one source URL and a `checked` date, enforced by
  the build.
- A number that cannot be traced to a source is not entered. Google AI Ultra
  carries `price_usd_month: null` because no first-party page was verified,
  rather than a figure copied from an SEO aggregator.
- Where sources conflict, the conflict goes in the `note` field instead of being
  silently resolved.
- No em dashes.

## Contributing

Add or correct a provider by editing one file in `data/providers/`, then run
`node src/build.js`. CI runs the same validation on every pull request. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Who qualifies

A vendor belongs here only if it ships **both its own model and its own coding
agent**. Nine do:

| Vendor | Agent | Coding model |
|---|---|---|
| Anthropic | Claude Code | Claude Opus 5, Sonnet 5 |
| OpenAI | Codex | GPT-5.6 Sol, Terra |
| xAI | Grok Build | Grok 4.6 |
| Google | Antigravity CLI | Gemini 3.7 Flash |
| Z.ai | GLM Coding Plan | GLM-5.3 |
| Moonshot | Kimi Code | Kimi K3, K2.7 Code |
| Alibaba | Qwen Code | Qwen3.8 Max, Qwen3 Coder Next |
| MiniMax | MiniMax CLI | MiniMax M3 |
| Mistral | Vibe CLI | Devstral 2 |

**Harnesses are excluded.** Cursor and GitHub Copilot are good products and
neither trains the model you are billed for, so there is no subsidy of theirs to
measure: they resell somebody else's tokens with a margin. Their credit pools
are a retail markup question, not a subsidy question.

**API-key-only vendors are excluded.** DeepSeek, Meta, NVIDIA, Upstage, SK, LG,
Cohere and Thinking Machines ship strong models and none of them sell a
subscription you log a coding agent into. Pay-per-token has nothing to subsidise.

## License

MIT
