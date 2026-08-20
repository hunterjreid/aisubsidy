<div align="center">

# aisubsidy

### How subsidised is your AI?

**[aisubsidy.pages.dev](https://aisubsidy.pages.dev)**

Every AI coding subscription, what it costs, and what it actually hands you.

</div>

---

## Why this exists

I kept making the same decision with no information.

You pay $20, $100, $200 a month for a coding agent and nobody tells you what
that buys. Anthropic sells Pro, Max 5x and Max 20x without ever saying what 1x
is. OpenAI publishes a weekly message cap without saying how big a message is.
Z.ai counts prompts, Kimi counts calls, Qwen counts requests, and none of it
converts to anything you can put side by side.

So the only question that matters has no published answer: **am I getting more
than I pay for, or less?**

I was curious. It turned out to be answerable, just not by reading pricing
pages.

## It cannot be done once

This is the part that makes it a project rather than a blog post.

Every one of these numbers is a moving target. Prices get cut. Caps get quietly
raised, and quietly lowered. A CLI gets discontinued and replaced by one with a
tenth of the quota. Plan tiers appear and disappear. A figure that was exactly
right in August is a lie by November, and nothing on the page tells you which.

A comparison table published once is worse than nothing, because it looks
current forever.

So this is built to be re-measured rather than re-published. The data is a set
of files with a source link and a date on every figure, the measurements name
the command that reproduces them, and anything nobody can currently source is
left visibly blank instead of quietly stale.

**Which means it only works as a community effort.** One person on one machine
measures one plan on one vendor. There are nineteen plans here and fourteen of
them have no ceiling anybody has put a number on yet. That is not a gap I can
close by trying harder; it needs people on different plans running the same
measurement.

## What it found so far

- A **Claude Max 5x** subscription is capped at roughly **$1,339 a month** of
  usage on a $100 plan. That is **13.4x**.
- Anthropic's credit system is a flat **$7.50 per million credits**, identical
  across every model and both directions. And **cache reads cost nothing**,
  which on a real month was 98% of all tokens. That gap, not the plan price, is
  the subsidy.
- A **SuperGrok** week measured at its actual cap returned **$339** of usage on
  a $30 plan.
- The advertised multipliers are wrong. Max 5x is 8.33x on the weekly window and
  6x on the five-hour one. Neither of them is 5.

## How to use it

**Just want the numbers?** They are on the site. No signup, no account:
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

**Want the raw data?** Open, and no key needed:

| | |
|---|---|
| Everything | [`/api/catalog`](https://aisubsidy.pages.dev/api/catalog) |
| Plans | [`/api/plans`](https://aisubsidy.pages.dev/api/plans) |
| Models | [`/api/models`](https://aisubsidy.pages.dev/api/models) |
| For an LLM | [`/llms.txt`](https://aisubsidy.pages.dev/llms.txt) |

## Contribute a measurement

This is the useful one, and it takes about a minute.

Run the skill, answer two questions (which plan, and whether you actually hit
the cap), and let it send the result. **Whether you hit the cap is the
load-bearing one** — somebody who never reaches the limit has measured a floor,
not a ceiling, and a plan measured only by light users reads as far worse value
than it is.

Nothing you send changes the site on its own. Submissions queue up, and a figure
moves into the catalogue once several independent measurements agree, because
one person's month is a sample of one.

Also useful:

- **Something wrong or out of date?**
  [Say so](https://aisubsidy.pages.dev/requests). The backlog is public,
  including everything that has not been done.
- **A vendor missing?** Same place. It qualifies if it trains its own model and
  ships its own coding agent.

## What it will not do

**No ads, no affiliate links, no sponsored placements, ever.** A comparison site
paid by the vendors it compares is worth nothing. This one is paid for by
whoever wants it to exist, and you can
[chip in](https://aisubsidy.pages.dev/donate) if that is you.

**No number without a source.** If a figure cannot be traced to the vendor's own
page, it stays blank rather than getting filled with a plausible guess. The
blank cells are not missing work, they are the finding.

## License

MIT. Take it.
