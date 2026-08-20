<div align="center">

# aisubsidy

### How subsidised is your AI?

**[aisubsidy.pages.dev](https://aisubsidy.pages.dev)**

Every AI coding subscription, what it costs, and what it actually hands you.

</div>

---

## What it's for

You pay $20, $100, $200 a month for a coding agent. Nobody tells you what that
buys.

Anthropic sells Pro, Max 5x and Max 20x without ever saying what 1x is. OpenAI
publishes a weekly message cap without saying how big a message is. Z.ai counts
prompts, Kimi counts calls, Qwen counts requests, and not one of them converts
to anything you can compare.

So you cannot answer the only question that matters: **am I getting more than I
pay for, or less?**

aisubsidy answers it. It takes the vendor's own public API price, works out what
the plan actually lets through, and divides one by the other.

Some of what falls out:

- A Claude Max 5x subscription is capped at about **$1,339 a month** of usage,
  on a $100 plan. That is **13.4x**.
- Anthropic's credit system is a flat **$7.50 per million credits**, identical
  across every model. And **cache reads cost nothing**, which on a real month
  was 98% of all tokens.
- A **SuperGrok** week measured at its cap returned **$339** of usage on a $30
  plan.
- The advertised multipliers are wrong. Max 5x is 8.33x on the weekly window
  and 6x on the five-hour one. Neither is 5.

## How to use it

**Just want the numbers?** They are on the site, no signup, no account:
**[aisubsidy.pages.dev](https://aisubsidy.pages.dev)**

**Want your own?** There is a skill for that. Drop it in and ask your agent.

```sh
curl -o ~/.claude/skills/aisubsidy-measure/SKILL.md \
  --create-dirs https://aisubsidy.pages.dev/skill.md
```

Then say: *"measure my AI subscriptions"*.

It reads the token counts Claude Code, Codex and Grok already write to your own
disk, works out which plan you are on, prices what you burned at the vendor's
own rates, and tells you your multiple.

It sends nothing anywhere unless you say yes, and what it can send is model
names and token counts. No prompts, no code, no file paths.

**Want the raw data?** It is open, and it needs no key:

| | |
|---|---|
| Everything | [`/api/catalog`](https://aisubsidy.pages.dev/api/catalog) |
| Plans | [`/api/plans`](https://aisubsidy.pages.dev/api/plans) |
| Models | [`/api/models`](https://aisubsidy.pages.dev/api/models) |
| For an LLM | [`/llms.txt`](https://aisubsidy.pages.dev/llms.txt) |

## Why you should trust it

**Every number has a source link and a date.** If a figure cannot be traced to
the vendor's own page, it is left blank rather than filled with a guess. Blank
cells on the site are not gaps, they are the finding: fourteen of nineteen plans
publish no usable cap at all.

**No ads, no affiliate links, no sponsored placements, ever.** A comparison site
paid by the vendors it compares is worth nothing. This one is paid for by
whoever wants it to exist.

**Nothing is measured that cannot be reproduced.** Every measured figure names
the method and the command that produces it.

## Help out

- **Something wrong or missing?** [Say so](https://aisubsidy.pages.dev/requests).
  The backlog is public, including what has not been done.
- **Measure your plan.** Fourteen plans have no ceiling anybody has put a number
  on. Yours might be one of them.
- **[Chip in](https://aisubsidy.pages.dev/donate)** if you want it to stay
  independent.

## License

MIT. Take it.
