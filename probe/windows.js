#!/usr/bin/env node
//
// Window analysis. The probe answers "what did you burn". This answers "what is
// the ceiling", which is the number every vendor refuses to publish.
//
// Anthropic and OpenAI meter in rolling windows. If you saturate a window, the
// tokens you got through it ARE the cap. So: bucket every assistant turn into
// its window, price each window, and take the top of the distribution. A user
// who never hits the limit produces a floor, not a ceiling, so this reports the
// spread and the saturation count rather than a single number.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/lib/catalog.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };

const DAYS = Number(flag("days", 30));
const WINDOW_H = Number(flag("window", 5));
const CUTOFF = Date.now() - DAYS * 86400_000;
const WINDOW_MS = WINDOW_H * 3600_000;

const catalog = loadCatalog(join(root, "data", "providers"));
const PRICES = new Map();
for (const p of catalog.providers) {
  for (const m of p.api_prices || []) {
    if (m.in !== null) PRICES.set(m.model, { in: m.in, out: m.out, provider: p.provider });
  }
}
const CACHE = { anthropic: { write: 1.25, read: 0.1 }, openai: { write: 1.0, read: 0.1 } };

function* walk(dir, depth) {
  if (depth < 0 || !existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full, depth - 1);
    else if (e.isFile() && e.name.endsWith(".jsonl")) yield full;
  }
}

// Every assistant turn: when it happened, what it cost, which model.
const turns = [];
for (const file of walk(join(homedir(), ".claude", "projects"), 2)) {
  let mtime;
  try { mtime = statSync(file).mtimeMs; } catch { continue; }
  if (mtime < CUTOFF) continue;

  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const u = row.message?.usage;
    const model = row.message?.model;
    if (!u || !model || model === "<synthetic>") continue;
    const p = PRICES.get(model);
    if (!p) continue;
    const c = CACHE[p.provider] || { write: 1, read: 0.1 };
    const usd =
      ((u.input_tokens || 0) / 1e6) * p.in +
      ((u.cache_creation_input_tokens || 0) / 1e6) * p.in * c.write +
      ((u.cache_read_input_tokens || 0) / 1e6) * p.in * c.read +
      ((u.output_tokens || 0) / 1e6) * p.out;
    const tokens = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) +
                   (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);
    turns.push({ t: Date.parse(row.timestamp), usd, tokens, model });
  }
}

if (!turns.length) {
  console.log("No priced Claude Code turns found in the window.");
  process.exit(0);
}
turns.sort((a, b) => a.t - b.t);

// Fixed buckets aligned to the first turn. Rolling windows would overcount by
// sliding across the same turns, so fixed buckets give a conservative ceiling.
const origin = turns[0].t;
const buckets = new Map();
for (const turn of turns) {
  const k = Math.floor((turn.t - origin) / WINDOW_MS);
  if (!buckets.has(k)) buckets.set(k, { usd: 0, tokens: 0, turns: 0 });
  const b = buckets.get(k);
  b.usd += turn.usd; b.tokens += turn.tokens; b.turns++;
}

const active = [...buckets.values()].filter((b) => b.turns >= 3).sort((a, b) => a.usd - b.usd);
const at = (q) => active[Math.min(active.length - 1, Math.floor(active.length * q))];
const sum = (f) => turns.reduce((a, t) => a + f(t), 0);

const money = (n) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

console.log(`\nwindow analysis  -  last ${DAYS} days, ${WINDOW_H}h buckets\n`);
console.log(`  ${fmt(turns.length)} priced turns across ${active.length} active windows`);
console.log(`  ${fmt(sum((t) => t.tokens) / turns.length)} tokens per turn on average`);
console.log(`  ${money(sum((t) => t.usd) / turns.length)} per turn at list API rates\n`);

console.log(`  per ${WINDOW_H}h window, at list API rates:`);
console.log(`    median   ${money(at(0.5).usd).padStart(9)}   ${fmt(at(0.5).turns).padStart(4)} turns`);
console.log(`    p90      ${money(at(0.9).usd).padStart(9)}   ${fmt(at(0.9).turns).padStart(4)} turns`);
console.log(`    max      ${money(active.at(-1).usd).padStart(9)}   ${fmt(active.at(-1).turns).padStart(4)} turns\n`);

// Saturating every window is the theoretical ceiling nobody actually reaches.
// The p90 figure is the honest one to quote.
const perDay = 24 / WINDOW_H;
console.log(`  if every window ran at p90:   ${money(at(0.9).usd * perDay * 30)}/mo`);
console.log(`  if every window ran at max:   ${money(active.at(-1).usd * perDay * 30)}/mo`);
console.log(`\n  Saturating all ${fmt(perDay * 30)} windows in a month is nobody's real life.`);
console.log(`  The p90 line is the defensible ceiling; max is the absolute bound.\n`);
