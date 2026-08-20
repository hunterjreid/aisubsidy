// Static page generation, robots, sitemap and llms.txt.
//
// Every plan and every model gets a real page with real data on it. That is the
// only kind of SEO worth having here: a crawler that lands on /plan/claude-max-20x
// should find the price, the quota, the ceiling and the sources, not a shell
// that needs JavaScript to say anything.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const SITE = "https://aisubsidy.pages.dev";
const TITLE = "aisubsidy";
const TAGLINE = "Every OAuth coding plan, what it costs, and the most it could possibly hand you.";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const slug = (s) => String(s).replace(/[^a-z0-9.-]/gi, "-");

const PERIOD = { "5h": "per 5 hours", "7d": "per week", "30d": "per month" };

// Prose, not a table dump. A crawler and a reader want the same sentence.
export function quotaSentence(plan, byId) {
  const q = plan.quota || {};
  if (q.kind === "byok") return "Nothing is bundled. The CLI is free and the model bills separately through the API.";

  const parts = (q.windows || []).map((w) => {
    const per = PERIOD[w.period] || `per ${w.period}`;
    if (w.unit === "opaque") return `an unpublished cap ${per}`;
    if (w.unit === "relative") {
      const base = byId.get(w.relative_to);
      const of = base ? ` of ${base.name}` : "";
      return w.amount === 1 ? `the baseline allowance ${per}` : `${w.amount} times the allowance${of} ${per}`;
    }
    if (w.amount == null) return `an unpublished number of ${w.unit} ${per}`;
    return `${w.amount.toLocaleString("en-US")} ${w.unit} ${per}`;
  });

  if (!parts.length) return "No quota is published for this plan.";
  const joined = parts.length === 1 ? parts[0]
    : parts.slice(0, -1).join(", ") + " and " + parts.at(-1);
  return `The plan allows ${joined}.`;
}

const CSS = `
:root{--bg:#0e0e0d;--panel:#161615;--ink:#ecebe6;--muted:#7d7a72;--line:#292826;
 --amber:#e8a33d;--accent:#e07a56;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
@media (prefers-color-scheme:light){:root{--bg:#faf9f7;--panel:#fff;--ink:#17160f;
 --muted:#6e6b62;--line:#e5e2db;--amber:#9a6410;--accent:#b8492e}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
 font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:36px 20px 72px}
a{color:var(--accent)}
nav{font-family:var(--mono);font-size:13px;margin-bottom:28px;color:var(--muted)}
nav.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.btns{display:flex;gap:8px}
.btn{font-family:ui-sans-serif,system-ui,sans-serif;font-size:13.5px;padding:7px 13px;
 border-radius:9px;border:1px solid var(--line);text-decoration:none;color:var(--ink);white-space:nowrap}
.btn:hover{border-color:var(--muted)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
h1{font-size:28px;margin:0 0 4px;letter-spacing:-.02em}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);
 margin:34px 0 10px;font-weight:600;font-family:var(--mono)}
.sub{color:var(--muted);font-family:var(--mono);font-size:14px;margin:0 0 26px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:0 0 8px}
.box{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.box .k{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.box .v{font-family:var(--mono);font-size:21px;margin-top:5px}
.box .v.amber{color:var(--amber);font-weight:600}
.box .n{font-size:12px;color:var(--muted);margin-top:5px;line-height:1.45}
ul{padding-left:20px}
li{margin:5px 0}
table{border-collapse:collapse;width:100%;font-size:14px;font-family:var(--mono)}
td,th{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left}
th{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:500}
footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--line);
 color:var(--muted);font-size:13px}
code{font-family:var(--mono);font-size:13px;background:color-mix(in srgb,var(--ink) 9%,transparent);
 padding:1px 5px;border-radius:4px}`;

function page({ path, title, description, body, jsonld }) {
  const url = SITE + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta name="theme-color" content="#0e0e0d" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#faf9f7" media="(prefers-color-scheme: light)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${TITLE}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="alternate" type="text/plain" href="${SITE}/llms.txt">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body><div class="wrap">
<nav class="bar"><span><a href="/">aisubsidy</a> / ${esc(title)}</span>
  <span class="btns"><a class="btn" href="/contribute">Contribute</a>
  <a class="btn primary" href="https://buy.stripe.com/aFa8wO2PzaDKf7c0y8d7q00" rel="noopener">Donate</a></span></nav>
${body}
<footer>
  Part of <a href="/">aisubsidy</a>, an open catalogue of AI coding subscription
  plans. Source and corrections at
  <a href="https://github.com/hunterjreid/aisubsidy">github.com/hunterjreid/aisubsidy</a>.
  Machine-readable: <a href="/llms.txt">llms.txt</a>, <a href="/api/catalog">JSON API</a>.
</footer>
</div></body></html>`;
}

function planPage(plan, catalog, byId) {
  const d = plan.derived || {};
  const models = (plan.models || [])
    .map((id) => catalog.models.find((m) => m.id === id))
    .filter(Boolean);
  const quota = quotaSentence(plan, byId);
  const ceiling = d.max_spend_usd_month;

  const title = `${plan.provider_name} ${plan.name}`;
  const description =
    `${title} costs ${plan.price_usd_month === null ? "an unpublished amount" : usd(plan.price_usd_month) + " a month"} ` +
    `and runs ${plan.product}. ${quota}` +
    (ceiling ? ` At the vendor's own API rates the ceiling is about ${usd(ceiling)} a month.` : "");

  const body = `
<h1>${esc(title)}</h1>
<p class="sub">${esc(plan.id)} &middot; ${esc(plan.product)}</p>

<div class="grid">
  <div class="box"><div class="k">Plan price</div>
    <div class="v">${plan.price_usd_month === null ? "not published" : usd(plan.price_usd_month) + "/mo"}</div>
    ${plan.price_usd_month_annual ? `<div class="n">${usd(plan.price_usd_month_annual)}/mo billed annually</div>` : ""}
  </div>
  <div class="box"><div class="k">Max possible spend</div>
    <div class="v${ceiling ? " amber" : ""}">${ceiling ? usd(ceiling) + "/mo" : "not measured"}</div>
    <div class="n">${esc(d.max_spend_note || "No vendor publishes this. It needs a measured saturated window.")}</div>
  </div>
</div>

<h2>What you get</h2>
<p>${esc(quota)}</p>
${plan.quota.note ? `<p>${esc(plan.quota.note)}</p>` : ""}
<p>Quota type <code>${esc(plan.quota.kind)}</code>, basis <code>${esc(plan.quota.confidence)}</code>.</p>

${models.length ? `<h2>Models included</h2>
<table>
<tr><th>Model</th><th>$/Mtok in</th><th>$/Mtok out</th><th>Blended</th></tr>
${models.map((m) => `<tr><td><a href="/model/${slug(m.id)}">${esc(m.name)}</a></td>
<td>${m.usd_in_mtok == null ? "n/a" : "$" + m.usd_in_mtok.toFixed(2)}</td>
<td>${m.usd_out_mtok == null ? "n/a" : "$" + m.usd_out_mtok.toFixed(2)}</td>
<td>${m.blended_usd_mtok == null ? "n/a" : "$" + m.blended_usd_mtok.toFixed(2)}</td></tr>`).join("")}
</table>` : ""}

<h2>Sources</h2>
<ul>${(plan.sources || []).map((s) => `<li><a href="${esc(s)}" rel="nofollow noopener">${esc(s)}</a></li>`).join("")}</ul>
<p class="sub">Checked ${esc(plan.checked)}. JSON: <a href="/api/plans/${esc(plan.id)}">/api/plans/${esc(plan.id)}</a></p>`;

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    description,
    brand: { "@type": "Brand", name: plan.provider_name },
    category: "AI coding assistant subscription",
    url: `${SITE}/plan/${slug(plan.id)}`,
    ...(plan.price_usd_month !== null && {
      offers: {
        "@type": "Offer",
        price: plan.price_usd_month,
        priceCurrency: "USD",
        url: (plan.sources || [])[0],
        availability: "https://schema.org/InStock"
      }
    })
  };

  return page({ path: `/plan/${slug(plan.id)}`, title: `${title} pricing and limits`, description, body, jsonld });
}

function modelPage(model, catalog) {
  const plans = catalog.plans.filter((p) => (p.models || []).includes(model.id));
  const rate = model.blended_usd_mtok;
  const title = model.name;
  const description =
    `${model.name} from ${model.provider_name} costs ` +
    (model.usd_in_mtok == null
      ? "an amount not published first-party"
      : `$${model.usd_in_mtok.toFixed(2)} per million input tokens and $${model.usd_out_mtok.toFixed(2)} per million output tokens`) +
    `. Reachable through ${model.product}` +
    (plans.length ? ` on ${plans.length} OAuth plan${plans.length > 1 ? "s" : ""}.` : ".");

  const body = `
<h1>${esc(model.name)}</h1>
<p class="sub">${esc(model.id)} &middot; ${esc(model.provider_name)} &middot; ${esc(model.product)}</p>

<div class="grid">
  <div class="box"><div class="k">Input</div><div class="v">${model.usd_in_mtok == null ? "not sourced" : "$" + model.usd_in_mtok.toFixed(2)}</div><div class="n">per million tokens</div></div>
  <div class="box"><div class="k">Output</div><div class="v">${model.usd_out_mtok == null ? "not sourced" : "$" + model.usd_out_mtok.toFixed(2)}</div><div class="n">per million tokens</div></div>
  <div class="box"><div class="k">Blended</div><div class="v${rate ? " amber" : ""}">${rate == null ? "not sourced" : "$" + rate.toFixed(2)}</div><div class="n">input weighted 3:1 over output, because a coding agent reads far more than it writes</div></div>
</div>

${model.note ? `<h2>Notes</h2><p>${esc(model.note)}</p>` : ""}

${plans.length ? `<h2>Plans that include it</h2>
<table>
<tr><th>Plan</th><th>Price</th><th>Max possible spend</th></tr>
${plans.map((p) => `<tr><td><a href="/plan/${slug(p.id)}">${esc(p.provider_name)} ${esc(p.name)}</a></td>
<td>${p.price_usd_month == null ? "n/a" : usd(p.price_usd_month) + "/mo"}</td>
<td>${p.derived?.max_spend_usd_month ? usd(p.derived.max_spend_usd_month) + "/mo" : "not measured"}</td></tr>`).join("")}
</table>` : ""}

<p class="sub">Checked ${esc(model.checked)}. JSON: <a href="/api/models/${esc(model.id)}">/api/models/${esc(model.id)}</a></p>`;

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: model.name,
    applicationCategory: "DeveloperApplication",
    description,
    url: `${SITE}/model/${slug(model.id)}`,
    author: { "@type": "Organization", name: model.provider_name }
  };

  return page({ path: `/model/${slug(model.id)}`, title: `${title} API pricing`, description, body, jsonld });
}

function contributePage(catalog) {
  const unmeasured = catalog.plans.filter((p) => p.derived?.max_spend_usd_month == null);
  const description =
    "How to add a vendor, correct a number, or submit a measurement to aisubsidy. " +
    "Every figure needs a first-party source or it stays null.";

  const body = `
<h1>How to contribute</h1>
<p class="sub">Two ways in: fix the catalogue, or measure a plan nobody has measured.</p>

<p>Everything here lives in one JSON file per vendor at
<code>data/providers/</code>. Edit a file, run the build, open a pull request.
The build fails on anything malformed, so a green check means the shape is
right. It cannot tell whether the number is true, which is what review is for.</p>

<h2>The bar for a number</h2>
<p><strong>Every plan needs a first-party source URL.</strong> A vendor pricing
page, vendor docs, or a vendor changelog. Not a comparison blog, not an SEO
aggregator, not a YouTube description. Third-party figures for AI pricing
contradict each other constantly and a good number of them are generated.</p>

<p><strong>If you cannot source it, leave it null.</strong> A blank cell is a
correct statement that nobody knows. A number copied off a listicle is a wrong
statement that looks authoritative, and it will get quoted back at people.
Google AI Ultra sat here with a null price for exactly this reason before the
vendor was dropped.</p>

<p><strong>If sources conflict, record it in <code>note</code></strong> rather
than picking a winner. There are live contradictions in GLM Pro and Max pricing
and in Kimi's dollar tiers, and the notes say so.</p>

<p><strong>Update <code>checked</code> when you verify.</strong> It is the date
somebody actually looked, not the date the file changed.</p>

<h2>Measuring a plan</h2>
<p>This is the valuable one. ${unmeasured.length} of ${catalog.plans.length}
plans have no ceiling anybody can put a number on, because the vendor publishes
a price and a multiplier and nothing else. The only way through is measurement.</p>

<h3>The easy way: run the skill</h3>
<p>Drop <a href="/skill.md">skill.md</a> into <code>.claude/skills/aisubsidy-measure/SKILL.md</code>
and ask your agent to measure your plan. It reads your local logs, prices them,
shows you the result, asks which plan you are on and whether you hit the cap,
then shows you the exact JSON and waits for a yes before sending anything.</p>

<pre>curl -o ~/.claude/skills/aisubsidy-measure/SKILL.md \\
  --create-dirs ${SITE}/skill.md</pre>

<h3>The manual way</h3>
<pre>git clone https://github.com/hunterjreid/aisubsidy
cd aisubsidy
node probe/windows.js --days 30
node probe/probe.js --days 30 --plan &lt;plan-id&gt; --submit measurement.json
curl -X POST ${SITE}/api/submit -H 'content-type: application/json' \\
  --data @measurement.json</pre>

<p>Both read the token counts Claude Code and Codex already write to
<code>~/.claude/projects</code> and <code>~/.codex/sessions</code>. Nothing
leaves your machine unless you pass <code>--submit</code>, and the file that
writes contains model names and token counts only: no paths, no project names,
no prompts. Open it before you attach it anyway.</p>

<p>Attach it to an issue titled <code>measurement: &lt;plan-id&gt;</code>. A
useful measurement says how the plan was used: one model or several,
interactive or long autonomous runs, and <strong>whether you actually hit the
cap</strong>. Somebody who never reaches the limit measures a floor, not a
ceiling, and a plan measured only by light users reads as worse value than it
is. A figure moves into the catalogue once several independent measurements
agree, because one person's month is a sample of one.</p>

<h2>Which vendors belong here</h2>
<p>A vendor qualifies only if it ships <strong>both its own model and its own
coding agent</strong>. An API key is not a plan. A reseller is not first party.</p>
<p>Harnesses are out on purpose. Cursor and GitHub Copilot are good products and
neither trains the model you are billed for, so their credit pools measure a
retail markup rather than a subsidy. Both were built here and then removed.</p>

<h2>Plan shape</h2>
<pre>{
  "id": "kebab-case-globally-unique",
  "name": "Human name",
  "price_usd_month": 20,
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
}</pre>

<p>Pick <code>kind</code> by what the vendor actually meters: a dollar balance
is <code>credit_pool</code>, an opaque cap per rolling window is
<code>rate_window</code>, countable prompts or calls are
<code>request_count</code>, an explicit token allowance is
<code>token_pool</code>, and a free tool that bills through the API is
<code>byok</code>. Setting a dollar figure while leaving confidence
<code>unknown</code> is rejected by the build, because an unsourceable dollar
figure is the exact thing this project exists to avoid.</p>

<h2>House rules</h2>
<ul>
  <li>Docs state what is true now. Git holds the history.</li>
  <li>No em dashes anywhere, in code, docs or commits.</li>
  <li>If something can be removed, remove it. There is no database: the
  catalogue is JSON files and the build compiles them.</li>
</ul>

<p class="sub"><a href="https://github.com/hunterjreid/aisubsidy">Repository</a>
&middot; <a href="https://github.com/hunterjreid/aisubsidy/issues/new">Open an issue</a>
&middot; MIT licensed</p>`;

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to contribute to aisubsidy",
    description,
    url: `${SITE}/contribute`,
    step: [
      { "@type": "HowToStep", name: "Fork and edit", text: "Edit one JSON file per vendor in data/providers/." },
      { "@type": "HowToStep", name: "Source every number", text: "Each figure needs a first-party vendor URL, or it stays null." },
      { "@type": "HowToStep", name: "Measure a plan", text: "Run probe/windows.js and probe/probe.js against your own session logs and attach the anonymised result." },
      { "@type": "HowToStep", name: "Open a pull request", text: "The build validates shape on every pull request." }
    ]
  };

  return page({ path: "/contribute", title: "How to contribute", description, body, jsonld });
}

// llms.txt, per the llmstxt.org convention: a short orientation file that tells
// a model what is here and where the real data lives.
function llmsTxt(catalog) {
  const lines = [
    `# ${TITLE}`,
    "",
    `> ${TAGLINE}`,
    "",
    "A catalogue of AI coding subscription plans that you log a CLI into with OAuth,",
    "covering only vendors that train their own model and ship their own coding agent.",
    "Harnesses that resell another vendor's tokens are excluded, because a reseller's",
    "margin is not a subsidy.",
    "",
    "The central problem: no vendor publishes how many tokens a plan buys. This site",
    "records what can be sourced (list API rates, plan prices, published quotas) and",
    "refuses to invent the rest. Where a figure is unknown it is null, never estimated.",
    "A companion probe measures real consumption from local agent session logs.",
    "",
    "## Data",
    "",
    `- [Full catalogue JSON](${SITE}/api/catalog): every vendor, plan, model and derived metric`,
    `- [Plans JSON](${SITE}/api/plans): all ${catalog.plans.length} OAuth plans`,
    `- [Models JSON](${SITE}/api/models): all ${catalog.models.length} models with per-token rates`,
    `- [Full text dump](${SITE}/llms-full.txt): the whole catalogue as plain prose`,
    `- [How to contribute](${SITE}/contribute): the sourcing bar, the plan shape, and how to submit a measurement`,
    `- [Measurement skill](${SITE}/skill.md): a drop-in agent skill that measures a plan and submits the result`,
    `- [Submit endpoint](${SITE}/api/submit): POST a measurement, GET the schema`,
    `- [Measurements](${SITE}/api/measurements?group=plan): what has been submitted so far`,
    `- [Source repository](https://github.com/hunterjreid/aisubsidy): MIT, corrections by pull request`,
    "",
    "## Plans",
    ""
  ];
  for (const p of catalog.plans) {
    const price = p.price_usd_month === null ? "price not published" : `${usd(p.price_usd_month)}/mo`;
    const ceil = p.derived?.max_spend_usd_month
      ? `, ceiling about ${usd(p.derived.max_spend_usd_month)}/mo at list API rates`
      : "";
    lines.push(`- [${p.provider_name} ${p.name}](${SITE}/plan/${slug(p.id)}): ${p.product}, ${price}${ceil}`);
  }
  lines.push("", "## Models", "");
  for (const m of catalog.models) {
    const rate = m.blended_usd_mtok == null
      ? "no first-party rate sourced"
      : `$${m.usd_in_mtok.toFixed(2)} in / $${m.usd_out_mtok.toFixed(2)} out per Mtok`;
    lines.push(`- [${m.name}](${SITE}/model/${slug(m.id)}): ${m.provider_name}, ${rate}`);
  }
  return lines.join("\n") + "\n";
}

// The whole catalogue as prose, for a model that wants everything in one fetch.
function llmsFullTxt(catalog, byId) {
  const out = [`# ${TITLE}: full catalogue`, "", `> ${TAGLINE}`, "",
    `Generated from the source data. ${catalog.providers.length} vendors, ` +
    `${catalog.plans.length} plans, ${catalog.models.length} models.`, ""];

  for (const prov of catalog.providers) {
    out.push(`## ${prov.display_name} (${prov.product})`, "");
    out.push(`Authentication: ${prov.auth}. Checked ${prov.checked}. Homepage: ${prov.homepage}`, "");

    if ((prov.api_prices || []).length) {
      out.push("### API rates", "");
      for (const m of prov.api_prices) {
        out.push(m.in == null
          ? `- ${m.name} (${m.model}): no first-party per-token rate sourced.${m.note ? " " + m.note : ""}`
          : `- ${m.name} (${m.model}): $${m.in.toFixed(2)} per million input tokens, ` +
            `$${m.out.toFixed(2)} per million output tokens.${m.note ? " " + m.note : ""}`);
      }
      out.push("");
    }

    out.push("### Plans", "");
    for (const p of prov.plans) {
      out.push(`#### ${p.name} (${p.id})`, "");
      out.push(p.price_usd_month === null
        ? "Price: not published first-party."
        : `Price: ${usd(p.price_usd_month)} per month.` +
          (p.price_usd_month_annual ? ` ${usd(p.price_usd_month_annual)} per month billed annually.` : ""));
      out.push(quotaSentence(p, byId));
      if (p.quota.note) out.push(p.quota.note);
      out.push(`Quota type: ${p.quota.kind}. Basis: ${p.quota.confidence}.`);
      if (p.derived?.max_spend_usd_month) {
        out.push(`Maximum possible spend at list API rates: about ${usd(p.derived.max_spend_usd_month)} ` +
          `per month (${p.derived.max_spend_note}). This is a ceiling assuming every window runs flat out, not a forecast.`);
      } else {
        out.push("Maximum possible spend: not measured. The vendor publishes no token figure.");
      }
      if ((p.models || []).length) out.push(`Models: ${p.models.join(", ")}.`);
      out.push(`Sources: ${(p.sources || []).join(" ")}`);
      out.push("");
    }

    for (const m of prov.measurements || []) {
      out.push("### Measurement", "");
      out.push(`Plan ${m.plan}, ${m.days} days, ${m.turns.toLocaleString("en-US")} turns across ` +
        `${m.active_windows} active ${m.window} windows. Median ${usd(m.usd_per_window_median)} per window, ` +
        `p90 ${usd(m.usd_per_window_p90)}, max ${usd(m.usd_per_window_max)}. Method: ${m.method}. ${m.note}`, "");
    }
  }
  return out.join("\n") + "\n";
}

function sitemap(catalog) {
  const urls = [
    { loc: SITE + "/", priority: "1.0", freq: "weekly" },
    { loc: SITE + "/contribute", priority: "0.9", freq: "monthly" },
    ...catalog.plans.map((p) => ({ loc: `${SITE}/plan/${slug(p.id)}`, priority: "0.8", freq: "weekly", lastmod: p.checked })),
    ...catalog.models.map((m) => ({ loc: `${SITE}/model/${slug(m.id)}`, priority: "0.7", freq: "weekly", lastmod: m.checked }))
  ];
  const entries = urls.map((u) => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

const ROBOTS = `# aisubsidy - open catalogue of AI coding subscription plans
# Everything here is meant to be read, by people and by models alike.

User-agent: *
Allow: /

# Named crawlers, allowed explicitly so there is no ambiguity.
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: anthropic-ai
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Applebot-Extended
Allow: /
User-agent: CCBot
Allow: /
User-agent: Bingbot
Allow: /
User-agent: cohere-ai
Allow: /
User-agent: Bytespider
Allow: /
User-agent: Amazonbot
Allow: /
User-agent: meta-externalagent
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

export function writeSeo(root, catalog) {
  const pub = join(root, "public");
  const byId = new Map(catalog.plans.map((p) => [p.id, p]));
  let count = 0;

  mkdirSync(join(pub, "plan"), { recursive: true });
  for (const plan of catalog.plans) {
    writeFileSync(join(pub, "plan", `${slug(plan.id)}.html`), planPage(plan, catalog, byId));
    count++;
  }

  mkdirSync(join(pub, "model"), { recursive: true });
  for (const model of catalog.models) {
    writeFileSync(join(pub, "model", `${slug(model.id)}.html`), modelPage(model, catalog));
    count++;
  }

  writeFileSync(join(pub, "contribute.html"), contributePage(catalog));
  count++;

  // The contributor skill is served as a file so somebody can drop it straight
  // into .claude/skills/ without cloning anything.
  const skill = join(root, "skills", "aisubsidy-measure", "SKILL.md");
  if (existsSync(skill)) writeFileSync(join(pub, "skill.md"), readFileSync(skill));

  writeFileSync(join(pub, "robots.txt"), ROBOTS);
  writeFileSync(join(pub, "sitemap.xml"), sitemap(catalog));
  writeFileSync(join(pub, "llms.txt"), llmsTxt(catalog));
  writeFileSync(join(pub, "llms-full.txt"), llmsFullTxt(catalog, byId));

  return { pages: count, urls: count + 1 };
}
