import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const QUOTA_KINDS = ["credit_pool", "rate_window", "request_count", "token_pool", "byok"];
export const CONFIDENCE = ["published", "derived", "measured", "unknown"];
export const AUTH_KINDS = ["oauth", "api_key", "both"];

// A provider file that fails any of these is rejected by the build. The point is
// that a number nobody can trace to a source is worse than no number at all.
function validateProvider(file, p) {
  const err = [];
  const need = (cond, msg) => { if (!cond) err.push(`${file}: ${msg}`); };

  need(typeof p.provider === "string" && /^[a-z0-9-]+$/.test(p.provider), "provider must be a kebab-case slug");
  need(typeof p.display_name === "string", "display_name required");
  need(typeof p.product === "string", "product required");
  need(AUTH_KINDS.includes(p.auth), `auth must be one of ${AUTH_KINDS.join(", ")}`);
  need(/^\d{4}-\d{2}-\d{2}$/.test(p.checked || ""), "checked must be YYYY-MM-DD");
  need(Array.isArray(p.plans) && p.plans.length > 0, "plans must be a non-empty array");

  need(Array.isArray(p.api_prices) && p.api_prices.length > 0,
    "a provider here must ship its own model, so api_prices cannot be empty");

  for (const m of p.api_prices || []) {
    need(typeof m.model === "string", "api_prices entry needs a model");
    need(typeof m.name === "string", `api_prices ${m.model} needs a display name`);
    need(typeof m.coding === "boolean", `api_prices ${m.model} needs a coding flag`);
    // null is allowed and means nobody has sourced a first-party rate. A blank
    // cell is a true statement; a scraped number is a false one.
    need(m.in === null || (typeof m.in === "number" && m.in >= 0), `api_prices ${m.model}: in must be a number or null`);
    need(m.out === null || (typeof m.out === "number" && m.out >= 0), `api_prices ${m.model}: out must be a number or null`);
  }

  for (const plan of p.plans || []) {
    const id = plan.id || "<no id>";
    need(typeof plan.id === "string" && /^[a-z0-9-]+$/.test(plan.id), `plan ${id}: id must be kebab-case`);
    need(typeof plan.name === "string", `plan ${id}: name required`);
    need(plan.price_usd_month === null || typeof plan.price_usd_month === "number",
      `plan ${id}: price_usd_month must be a number or null`);
    need(plan.quota && QUOTA_KINDS.includes(plan.quota.kind),
      `plan ${id}: quota.kind must be one of ${QUOTA_KINDS.join(", ")}`);
    need(plan.quota && CONFIDENCE.includes(plan.quota.confidence),
      `plan ${id}: quota.confidence must be one of ${CONFIDENCE.join(", ")}`);
    need(Array.isArray(plan.sources) && plan.sources.length > 0,
      `plan ${id}: at least one source URL required`);

    const q = plan.quota || {};
    if (q.kind === "credit_pool") {
      need(typeof q.included_value_usd === "number",
        `plan ${id}: credit_pool needs included_value_usd`);
    }
    if (typeof q.included_value_usd === "number" && q.confidence === "unknown") {
      need(false, `plan ${id}: has included_value_usd but confidence unknown`);
    }
  }
  return err;
}

// The two headline numbers.
//
// credit_multiple  - for plans denominated in dollars of usage. Exact, and
//                    nobody publishes it as a column: $60 buying $70 is 1.17x.
// usd_per_mtok     - what a million tokens costs you on this plan. Needs a
//                    token figure, which most vendors do not publish, so it
//                    stays null until a measurement fills it in.
function derive(plan) {
  const price = plan.price_usd_month;
  const q = plan.quota || {};
  const out = {
    credit_multiple: null,
    usd_per_mtok: null,
    tokens_per_dollar: null,
    gradeable: false
  };

  if (typeof price === "number" && price > 0 && typeof q.included_value_usd === "number") {
    out.credit_multiple = round(q.included_value_usd / price, 3);
    out.gradeable = true;
  }
  if (typeof price === "number" && price > 0 && typeof q.tokens_month === "number" && q.tokens_month > 0) {
    out.usd_per_mtok = round(price / (q.tokens_month / 1e6), 4);
    out.tokens_per_dollar = Math.round(q.tokens_month / price);
    out.gradeable = true;
  }
  if (q.kind === "byok") out.gradeable = true;
  return out;
}

const round = (n, d) => Number(n.toFixed(d));

export function loadCatalog(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const providers = [];
  const errors = [];
  const seenPlanIds = new Set();

  for (const file of files) {
    let raw;
    try {
      raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch (e) {
      errors.push(`${file}: invalid JSON (${e.message})`);
      continue;
    }
    errors.push(...validateProvider(file, raw));

    for (const plan of raw.plans || []) {
      if (seenPlanIds.has(plan.id)) errors.push(`${file}: duplicate plan id ${plan.id}`);
      seenPlanIds.add(plan.id);
      plan.derived = derive(plan);
      plan.provider = raw.provider;
      plan.provider_name = raw.display_name;
      plan.product = raw.product;
      plan.auth = raw.auth;
      plan.checked = raw.checked;
    }
    providers.push(raw);
  }

  const plans = providers.flatMap((p) => p.plans);

  // One row per model, with the plans that grant access to it. This is the
  // primary view: a vendor only belongs in this catalogue if it ships both its
  // own model and its own coding agent, so every model here has a plan behind it.
  const models = providers.flatMap((p) =>
    (p.api_prices || []).map((m) => ({
      id: m.model,
      name: m.name,
      coding: m.coding,
      provider: p.provider,
      provider_name: p.display_name,
      product: p.product,
      usd_in_mtok: m.in,
      usd_out_mtok: m.out,
      // A single comparable number. Coding agents read far more than they
      // write, so a blended rate weighted to input reflects real spend better
      // than either column alone. 3:1 is the ratio, stated rather than hidden.
      blended_usd_mtok:
        m.in === null || m.out === null ? null : Number(((m.in * 3 + m.out) / 4).toFixed(3)),
      plans: plans.filter((pl) => (pl.models || []).includes(m.model)).map((pl) => pl.id),
      note: m.note || null,
      checked: p.checked
    }))
  );

  return {
    providers,
    plans,
    models,
    errors,
    stats: {
      providers: providers.length,
      models: models.length,
      coding_models: models.filter((m) => m.coding).length,
      plans: plans.length,
      priced: models.filter((m) => m.blended_usd_mtok !== null).length
    }
  };
}
