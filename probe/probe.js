#!/usr/bin/env node
//
// aisubsidy probe - measures what YOUR coding agent actually burned.
//
// Anthropic and OpenAI publish multipliers and message caps, never token
// counts. That gap is the whole reason this project exists, and the only way
// to close it is to read the token counts the agents already write to disk.
//
// Reads:
//   Claude Code  ~/.claude/projects/<slug>/<session>.jsonl   (per-message usage)
//   Codex        ~/.codex/sessions/<y>/<m>/<d>/rollout-*.jsonl (cumulative token_count)
//
// Nothing leaves your machine. --submit writes an anonymised file you can
// choose to attach to a pull request.
//
// Usage:
//   node probe/probe.js                      last 30 days, all agents
//   node probe/probe.js --days 7             last 7 days
//   node probe/probe.js --plan claude-max-20x  price against a specific plan
//   node probe/probe.js --json               machine readable
//   node probe/probe.js --submit out.json    anonymised measurement file

import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/lib/catalog.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- args -------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (argv[i + 1] ?? true);
};
const has = (name) => argv.includes(`--${name}`);

const DAYS = Number(flag("days", 30));
const PLAN_ID = flag("plan");
const AS_JSON = has("json");
const SUBMIT_TO = flag("submit");
const CUTOFF = Date.now() - DAYS * 86400_000;

// ---- pricing ----------------------------------------------------------

const catalog = loadCatalog(join(root, "data", "providers"));
const PRICES = new Map();
for (const p of catalog.providers) {
  for (const m of p.api_prices || []) PRICES.set(m.model, { in: m.in, out: m.out, provider: p.provider });
}

// Cache multipliers against the base input rate. Anthropic publishes 1.25x to
// write and 0.1x to read; OpenAI discounts cached input to 0.1x and bills
// cache writes at the plain input rate.
const CACHE = {
  anthropic: { write: 1.25, read: 0.1 },
  openai: { write: 1.0, read: 0.1 },
  _default: { write: 1.0, read: 0.1 }
};

function priceOf(model, tokens) {
  const p = PRICES.get(model);
  if (!p) return { usd: null, model, priced: false };
  const c = CACHE[p.provider] || CACHE._default;
  const usd =
    (tokens.input / 1e6) * p.in +
    (tokens.cache_write / 1e6) * p.in * c.write +
    (tokens.cache_read / 1e6) * p.in * c.read +
    (tokens.output / 1e6) * p.out;
  return { usd, model, priced: true };
}

const emptyTokens = () => ({ input: 0, cache_write: 0, cache_read: 0, output: 0 });
const addTokens = (a, b) => {
  for (const k of Object.keys(a)) a[k] += b[k] || 0;
  return a;
};

// ---- walkers ----------------------------------------------------------

function* walk(dir, depth = 6) {
  if (depth < 0 || !existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, depth - 1);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) yield full;
  }
}

const recent = (file) => {
  try { return statSync(file).mtimeMs >= CUTOFF; } catch { return false; }
};

const lines = (file) => readFileSync(file, "utf8").split("\n").filter(Boolean);

function readClaudeCode() {
  const dir = join(homedir(), ".claude", "projects");
  const byModel = new Map();
  let sessions = 0;
  let turns = 0;

  for (const file of walk(dir, 2)) {
    if (!recent(file)) continue;
    let counted = false;
    for (const line of lines(file)) {
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      const msg = row.message;
      const u = msg?.usage;
      if (!u || !msg?.model) continue;
      const model = msg.model;
      // Claude Code logs local synthetic assistant turns with a zeroed usage
      // block. They are not billable and would show as an unpriced model.
      if (model === "<synthetic>") continue;
      if (!byModel.has(model)) byModel.set(model, emptyTokens());
      addTokens(byModel.get(model), {
        input: u.input_tokens || 0,
        cache_write: u.cache_creation_input_tokens || 0,
        cache_read: u.cache_read_input_tokens || 0,
        output: u.output_tokens || 0
      });
      counted = true;
      turns++;
    }
    if (counted) sessions++;
  }
  return { agent: "claude-code", sessions, turns, byModel };
}

function readCodex() {
  const dir = join(homedir(), ".codex", "sessions");
  const byModel = new Map();
  let sessions = 0;

  for (const file of walk(dir, 4)) {
    if (!recent(file)) continue;
    // total_token_usage is cumulative per session, so only the last one counts.
    let last = null;
    let model = "unknown";
    for (const line of lines(file)) {
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      const total = row?.payload?.info?.total_token_usage ?? row?.info?.total_token_usage;
      if (total) last = total;
      const m = row?.payload?.model ?? row?.model;
      if (typeof m === "string" && m.startsWith("gpt")) model = m;
    }
    if (!last) continue;
    if (!byModel.has(model)) byModel.set(model, emptyTokens());
    // input_tokens is inclusive of cached_input_tokens.
    const cacheRead = last.cached_input_tokens || 0;
    addTokens(byModel.get(model), {
      input: Math.max(0, (last.input_tokens || 0) - cacheRead),
      cache_write: last.cache_write_input_tokens || 0,
      cache_read: cacheRead,
      output: last.output_tokens || 0
    });
    sessions++;
  }
  // Codex logs a cumulative total per session rather than per turn, so a
  // session is the finest unit this file can honestly report.
  return { agent: "codex", sessions, turns: sessions, byModel };
}

// ---- report -----------------------------------------------------------

function summarise(source) {
  const models = [];
  const totals = emptyTokens();
  let apiValue = 0;
  let unpriced = 0;

  for (const [model, tokens] of source.byModel) {
    const { usd, priced } = priceOf(model, tokens);
    addTokens(totals, tokens);
    if (priced) apiValue += usd;
    else unpriced += tokens.input + tokens.cache_write + tokens.cache_read + tokens.output;
    models.push({
      model,
      tokens,
      total_tokens: tokens.input + tokens.cache_write + tokens.cache_read + tokens.output,
      api_value_usd: priced ? Number(usd.toFixed(2)) : null
    });
  }
  models.sort((a, b) => (b.api_value_usd || 0) - (a.api_value_usd || 0));

  const total = totals.input + totals.cache_write + totals.cache_read + totals.output;
  return {
    agent: source.agent,
    sessions: source.sessions,
    turns: source.turns ?? source.sessions,
    tokens: totals,
    total_tokens: total,
    api_value_usd: Number(apiValue.toFixed(2)),
    unpriced_tokens: unpriced,
    models
  };
}

const fmt = (n) => n.toLocaleString("en-US");
const money = (n) => "$" + n.toFixed(2);

const sources = [readClaudeCode(), readCodex()].filter((s) => s.byModel.size > 0);
const report = {
  window_days: DAYS,
  agents: sources.map(summarise)
};
report.total_api_value_usd = Number(
  report.agents.reduce((a, x) => a + x.api_value_usd, 0).toFixed(2)
);
report.total_tokens = report.agents.reduce((a, x) => a + x.total_tokens, 0);

// Price it against a plan if one was named.
if (PLAN_ID) {
  const plan = catalog.plans.find((p) => p.id === PLAN_ID);
  if (!plan) {
    console.error(`no such plan: ${PLAN_ID}`);
    console.error(`known: ${catalog.plans.map((p) => p.id).join(", ")}`);
    process.exit(1);
  }
  const monthly = plan.price_usd_month;
  const scaled = report.total_api_value_usd * (30 / DAYS);
  report.plan = {
    id: plan.id,
    name: `${plan.provider_name} ${plan.name}`,
    price_usd_month: monthly,
    api_value_usd_month: Number(scaled.toFixed(2)),
    subsidy_multiple: monthly > 0 ? Number((scaled / monthly).toFixed(2)) : null,
    usd_per_mtok: report.total_tokens > 0 && monthly > 0
      ? Number((monthly / (report.total_tokens * (30 / DAYS) / 1e6)).toFixed(4))
      : null
  };
}

if (SUBMIT_TO && typeof SUBMIT_TO === "string") {
  // Token counts and model names only. No paths, no prompts, no project names.
  const anon = {
    schema: "aisubsidy/measurement/1",
    window_days: DAYS,
    probe_version: "probe-1",
    usd_total: report.total_api_value_usd,
    agents: report.agents.map((a) => ({
      agent: a.agent,
      sessions: a.sessions,
      turns: a.turns,
      models: a.models.map((m) => ({ model: m.model, tokens: m.tokens }))
    })),
    plan_id: PLAN_ID || null,
    hit_cap: "unsure"
  };
  writeFileSync(SUBMIT_TO, JSON.stringify(anon, null, 2));
  console.log(`wrote anonymised measurement to ${SUBMIT_TO}`);
  process.exit(0);
}

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (!sources.length) {
  console.log(`No Claude Code or Codex sessions found in the last ${DAYS} days.`);
  console.log(`Looked in ~/.claude/projects and ~/.codex/sessions.`);
  process.exit(0);
}

console.log(`\naisubsidy probe  -  last ${DAYS} days\n`);
for (const a of report.agents) {
  console.log(`${a.agent}  (${a.sessions} sessions)`);
  for (const m of a.models) {
    const value = m.api_value_usd === null ? "no API price on file" : money(m.api_value_usd);
    console.log(`  ${m.model.padEnd(24)} ${fmt(m.total_tokens).padStart(14)} tok   ${value}`);
  }
  console.log(`  ${"".padEnd(24)} ${fmt(a.total_tokens).padStart(14)} tok   ${money(a.api_value_usd)}`);
  const t = a.tokens;
  console.log(`  ${"".padEnd(24)} ${("in " + fmt(t.input) + "  cache-write " + fmt(t.cache_write)).padStart(14)}`);
  console.log(`  ${"".padEnd(24)} ${("cache-read " + fmt(t.cache_read) + "  out " + fmt(t.output)).padStart(14)}\n`);
}

console.log(`At list API prices you burned ${money(report.total_api_value_usd)} of tokens.`);
console.log(`Cache reads bill at a tenth of the input rate, so they inflate the token`);
console.log(`count far more than the dollar figure. The dollar figure is the honest one.`);

if (report.plan) {
  const p = report.plan;
  console.log(`\n${p.name} costs ${money(p.price_usd_month)}/mo.`);
  console.log(`At this rate you would burn ${money(p.api_value_usd_month)}/mo of API-priced tokens.`);
  if (p.subsidy_multiple !== null) {
    console.log(`\n  subsidy multiple   ${p.subsidy_multiple}x  (API value burned per dollar paid)`);
    console.log(`  cost per Mtok      ${money(p.usd_per_mtok)}  (every token moved, cache reads included)`);
  }
} else {
  console.log(`\nPass --plan <id> to price this against a subscription. Try:`);
  console.log(`  node probe/probe.js --plan claude-max-20x`);
}
console.log();
