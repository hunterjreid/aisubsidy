#!/usr/bin/env node
//
// Codex ceiling, read directly rather than inferred.
//
// Anthropic needs a saturated window to reveal its cap, which is why the Claude
// figures are a p90 of many windows and carry a caveat. Codex does not: every
// `token_count` event carries a `rate_limits` block reporting what percentage
// of the quota window has been consumed, plus the plan it is metering.
//
//   "primary": { "used_percent": 19, "window_minutes": 10080, "resets_at": ... },
//   "plan_type": "plus"
//
// So the whole allowance falls out of one division: tokens burned in the window
// over the fraction of the window they represent. No saturation required, and a
// light user measures the same ceiling as a heavy one.
//
//   node probe/codex-limits.js [--days 60]

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/lib/catalog.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const DAYS = Number(flag("days", 60));
const CUTOFF = Date.now() - DAYS * 86400_000;

const catalog = loadCatalog(join(root, "data", "providers"));
const PRICES = new Map();
for (const p of catalog.providers) {
  for (const m of p.api_prices || []) if (m.in !== null) PRICES.set(m.model, m);
}

function* walk(dir, depth) {
  if (depth < 0 || !existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) yield* walk(f, depth - 1);
    else if (e.isFile() && e.name.endsWith(".jsonl")) yield f;
  }
}

// One entry per session: its final cumulative usage, the window it belongs to,
// and the highest quota percentage seen while it ran.
const sessions = [];

for (const file of walk(join(homedir(), ".codex", "sessions"), 4)) {
  let st;
  try { st = statSync(file); } catch { continue; }
  if (st.mtimeMs < CUTOFF) continue;

  let model = "gpt-5.6-sol";
  let lastUsage = null;
  let window = null;
  let maxPct = 0;
  let plan = null;

  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }

    const m = row?.payload?.model ?? row?.model;
    if (typeof m === "string" && m.startsWith("gpt")) model = m;

    const p = row?.payload;
    if (p?.type !== "token_count") continue;
    if (p.info?.total_token_usage) lastUsage = p.info.total_token_usage;

    const rl = p.rate_limits?.primary;
    if (rl && typeof rl.used_percent === "number") {
      if (rl.used_percent >= maxPct) { maxPct = rl.used_percent; window = rl; }
      plan = p.rate_limits.plan_type ?? plan;
    }
  }

  if (!lastUsage || !window) continue;
  sessions.push({ file, model, usage: lastUsage, window, pct: maxPct, plan, mtime: st.mtimeMs });
}

if (!sessions.length) {
  console.log(`No Codex sessions with rate_limit data in the last ${DAYS} days.`);
  process.exit(0);
}

// Group by the window each session was metered against. resets_at identifies it.
const windows = new Map();
for (const s of sessions) {
  const key = s.window.resets_at;
  if (!windows.has(key)) {
    windows.set(key, {
      resets_at: key, window_minutes: s.window.window_minutes,
      plan: s.plan, maxPct: 0, tokens: emptyTokens(), sessions: 0, models: new Map()
    });
  }
  const w = windows.get(key);
  w.sessions++;
  w.maxPct = Math.max(w.maxPct, s.pct);

  // input_tokens is inclusive of cached_input_tokens.
  const cached = s.usage.cached_input_tokens || 0;
  const t = {
    input: Math.max(0, (s.usage.input_tokens || 0) - cached),
    cache_write: s.usage.cache_write_input_tokens || 0,
    cache_read: cached,
    output: s.usage.output_tokens || 0
  };
  addTokens(w.tokens, t);
  if (!w.models.has(s.model)) w.models.set(s.model, emptyTokens());
  addTokens(w.models.get(s.model), t);
}

function emptyTokens() { return { input: 0, cache_write: 0, cache_read: 0, output: 0 }; }
function addTokens(a, b) { for (const k of Object.keys(a)) a[k] += b[k] || 0; return a; }

// OpenAI discounts cached input to a tenth and bills cache writes at the plain
// input rate.
function priceOf(models) {
  let usd = 0;
  for (const [model, t] of models) {
    const p = PRICES.get(model);
    if (!p) continue;
    usd += (t.input / 1e6) * p.in + (t.cache_write / 1e6) * p.in
         + (t.cache_read / 1e6) * p.in * 0.1 + (t.output / 1e6) * p.out;
  }
  return usd;
}

const money = (n) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const total = (t) => t.input + t.cache_write + t.cache_read + t.output;

console.log(`\ncodex ceiling  -  last ${DAYS} days, read from the agent's own rate_limits\n`);

const rows = [...windows.values()].sort((a, b) => a.resets_at - b.resets_at);
const estimates = [];

for (const w of rows) {
  const tok = total(w.tokens);
  const usd = priceOf(w.models);
  const hours = w.window_minutes / 60;
  const label = new Date(w.resets_at * 1000).toISOString().slice(0, 10);

  // A window observed at a low percentage divides by a small, coarsely rounded
  // number, so it amplifies the rounding error. Below 5% it is not evidence.
  const usable = w.maxPct >= 5;
  const line = `  resets ${label}  ${String(hours).padStart(4)}h  ` +
    `${String(w.maxPct).padStart(3)}% used  ${fmt(tok).padStart(14)} tok  ${money(usd).padStart(8)}` +
    `  ${w.sessions} sessions${w.plan ? "  plan=" + w.plan : ""}`;

  if (usable) {
    const fullTokens = tok / (w.maxPct / 100);
    const fullUsd = usd / (w.maxPct / 100);
    estimates.push({ plan: w.plan, hours, fullTokens, fullUsd, pct: w.maxPct, label });
    console.log(line);
    console.log(`      implies a full window of ${fmt(fullTokens)} tokens, ${money(fullUsd)} at list API rates`);
  } else {
    console.log(line + "   (under 5%, too coarse to divide)");
  }
}

if (!estimates.length) {
  console.log(`\nNo window reached 5% consumption, so nothing here is precise enough`);
  console.log(`to state a ceiling. Come back after a heavier week.\n`);
  process.exit(0);
}

// Group by the plan the agent reported. An account that changed tier partway
// through has windows metered against different caps, and pooling them produces
// a median that describes no plan that ever existed.
// Keyed by plan AND window size. OpenAI has metered a 5 hour window and a
// weekly one at different times, so a plan can hold both. Pooling a 5h cap with
// a 7d cap produces a number that is neither.
const byPlan = new Map();
for (const e of estimates) {
  const k = `${e.plan ?? "unknown"}|${e.hours}`;
  if (!byPlan.has(k)) byPlan.set(k, []);
  byPlan.get(k).push(e);
}

// Median rather than mean: used_percent is reported as a whole number, so a
// window observed low carries real rounding error and should not drag the rest.
const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

console.log(`\n  ${estimates.length} of ${rows.length} windows usable, across ${byPlan.size} plan tiers\n`);

for (const [key, list] of [...byPlan].sort((a, b) => b[1].length - a[1].length)) {
  const [plan, hoursStr] = key.split("|");
  const hours = Number(hoursStr);
  const usd = median(list.map((e) => e.fullUsd));
  const tok = median(list.map((e) => e.fullTokens));
  const perMonth = usd * (30 * 24) / hours;
  const conf = list.length >= 3 ? "" : "   (thin: needs more windows)";

  console.log(`  plan_type "${plan}"  ${String(list.length).padStart(2)} windows${conf}`);
  console.log(`    full ${hours}h window:  ${fmt(tok)} tokens, ${money(usd)} at list API rates`);
  console.log(`    scaled to 30 days:    ${money(perMonth)}`);
  console.log(`    windows observed at:  ${list.map((e) => e.pct + "%").join(", ")}\n`);
}

console.log(`  Read from Codex's own reported quota usage, not inferred from a`);
console.log(`  saturated window, so a light user measures the same cap as a heavy one.`);
console.log(`  The tradeoff is precision: used_percent is a whole number, so a window`);
console.log(`  seen at 8% divides by a value that could be 7.5 or 8.4.\n`);
