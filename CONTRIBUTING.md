# Contributing

Two kinds of contribution: catalogue corrections, and measurements.

## Correcting the catalogue

One file per provider in `data/providers/`. Edit it, run the build, open a pull
request.

```sh
node src/build.js
```

The build fails on anything malformed, so a green CI run means the shape is
right. It cannot tell whether the number is true, which is what review is for.

### The bar for a number

**Every plan needs a first-party source URL.** Vendor pricing page, vendor docs,
vendor changelog. Not a comparison blog, not an SEO aggregator, not a YouTube
description. Third-party figures for AI pricing contradict each other constantly
and several of them are model-generated.

**If you cannot source it, leave it null.** A blank cell is a correct statement
that nobody knows. A number copied from a listicle is a wrong statement that
looks authoritative, and it will be quoted back at people.

**If sources conflict, say so in `note`** rather than picking one. There are
currently live contradictions in GLM Pro and Max pricing and in Kimi's USD
tiers, and the notes record that.

**Update `checked` when you verify.** It is the date somebody actually looked,
not the date the file was edited.

### Plan shape

```json
{
  "id": "kebab-case-globally-unique",
  "name": "Human name",
  "price_usd_month": 20,
  "price_usd_month_annual": 17,
  "quota": {
    "kind": "credit_pool | rate_window | request_count | token_pool | byok",
    "windows": [{ "period": "5h", "unit": "prompts", "amount": 80 }],
    "included_value_usd": null,
    "tokens_month": null,
    "confidence": "published | derived | measured | unknown",
    "note": "anything the fields cannot carry"
  },
  "models": ["model-id"],
  "sources": ["https://vendor.example/pricing"]
}
```

Pick `kind` by what the vendor actually meters:

| kind | meaning | example |
|---|---|---|
| `credit_pool` | a dollar balance of usage | none currently; harnesses use this shape and none of them qualify |
| `rate_window` | an opaque cap per rolling window | Claude Code, Codex, Grok, Antigravity |
| `request_count` | a countable number of prompts or calls | GLM, Kimi, Qwen |
| `token_pool` | an explicit token allowance | MiniMax |
| `byok` | the tool is free, the model bills separately | Mistral Vibe |

`credit_pool` requires `included_value_usd`; the build rejects it otherwise.
Setting `included_value_usd` while leaving `confidence: "unknown"` is also
rejected, because a dollar figure nobody can source is exactly the thing this
project exists to avoid.

### Adding a provider

A provider belongs here if it sells a **first-party OAuth plan you log a coding
agent into**. An API key is not a plan. A reseller or aggregator is not
first-party. If the vendor only sells tokens, there is no subsidy to measure and
the answer is already on their pricing page.

## Contributing a measurement

This is the valuable one. Opaque plans stay opaque until somebody measures them.

```sh
node probe/probe.js --days 30 --plan <plan-id> --submit measurement.json
```

Open the file before attaching it. It contains model names and token counts and
nothing else, but check rather than trust.

Attach it to an issue titled `measurement: <plan-id>`. Useful measurements say
how the plan was used: mostly one model or mixed, interactive or long autonomous
runs, and whether you hit the cap in the window. A plan measured only by people
who never reach the limit reads as worse value than it is.

A `tokens_month` figure moves into the catalogue with
`confidence: "measured"` once several independent measurements agree. One
person's month is a sample of one, and a single number presented as the plan's
value would be the same mistake as copying a listicle.
