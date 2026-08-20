# aisubsidy

**How much is your AI vendor paying for you to code?**

Every coding agent worth using now sells an OAuth subscription instead of an API
key: Claude Code, Codex, Copilot, Cursor, Grok Build, GLM Coding Plan, Kimi Code,
Qwen Code, Antigravity, MiniMax. You pay a flat monthly fee and burn an unknown
number of tokens. Nobody publishes the number in the middle.

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

There are two kinds of plan, and only one of them can be compared honestly.

**Dollar-denominated plans** state what they include. Cursor Ultra is $200 and
includes $400 of model usage, so it returns 2.00x. Copilot Pro is $10 and
includes $15 of credits, so it returns 1.50x. That ratio is exact, published,
and nobody puts it in a comparison table.

**Opaque plans** state a price and a multiplier and nothing else. Anthropic
publishes Pro, Max 5x and Max 20x without ever saying what 1x is. OpenAI
publishes weekly message caps without saying how big a message is. Google
replaced a documented 1,000 requests per day with an undocumented weekly compute
cap. For these, no amount of reading marketing pages produces a number.

So the catalogue tracks the two separately and never blends them. A plan is
`gradeable` or it is `opaque`, and an opaque plan shows a blank cell rather than
a guess. The only thing that turns an opaque plan into a graded one is a
measurement.

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
| `GET /api/plans` | flat list of every plan |
| `GET /api/plans/:id` | one plan |
| `GET /api/providers` | providers without their plans |
| `GET /api/providers/:slug` | one provider with plans and API prices |
| `GET /api/stats` | counts |
| `GET /api/health` | validation result, non-empty `errors` means the data is wrong |

## The columns

**credit multiple** = dollars of usage included / dollars paid. Exact where it
exists. Only exists for `credit_pool` plans.

**$/Mtok** = monthly price / tokens the plan actually buys. Blank until somebody
measures it, because the vendors do not publish the denominator.

**basis** = where the number came from. `published` means the vendor states it.
`derived` means it was computed from something they state. `measured` means it
came from session logs. `unknown` means nobody has a defensible figure yet, and
a blank cell is the correct output.

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

## Coverage

Included: Anthropic, OpenAI, GitHub, Cursor, Z.ai, Moonshot, xAI, Google,
Alibaba, MiniMax, Mistral.

Deliberately excluded: vendors with no first-party OAuth coding plan. DeepSeek,
Meta, NVIDIA, Upstage, SK, LG, Cohere and Thinking Machines all ship strong
models and none of them sell a subscription you log a coding agent into. There
is no subsidy to measure on an API key.

## License

MIT
