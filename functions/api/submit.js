// POST /api/submit - receive a measurement.
//
// Write path: validate, put the raw body in R2 under a content-addressed key,
// then index it in D1. R2 is the source of truth and never mutated; D1 is a
// rebuildable index. If the D1 write fails the object still exists and can be
// replayed, so a submission is never silently lost.
//
// Nothing here enters the catalogue. The catalogue is git, and git is the
// moderation: a figure moves into data/providers/ by pull request once several
// independent submissions agree. One person's month is a sample of one.

const MAX_BODY = 256 * 1024;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store"
    }
  });

export const onRequestOptions = () => json({ ok: true });

export const onRequestGet = () =>
  json({
    endpoint: "POST /api/submit",
    accepts: "application/json",
    schema: "aisubsidy/measurement/1",
    required: ["schema", "plan_id", "agents"],
    optional: ["window_hours", "usd_window_median", "usd_window_p90", "usd_window_max",
               "active_windows", "hit_cap", "note", "probe_version"],
    generate: "node probe/probe.js --days 30 --plan <id> --submit measurement.json",
    note: "Submissions are queued for review. Nothing posted here changes the catalogue directly."
  });

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const int = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);

// Reject anything that is not shaped like a measurement, before it costs a write.
function validate(b) {
  const err = [];
  if (b?.schema !== "aisubsidy/measurement/1") err.push("schema must be aisubsidy/measurement/1");
  if (typeof b?.plan_id !== "string" || !/^[a-z0-9-]{2,40}$/.test(b.plan_id))
    err.push("plan_id must be a kebab-case plan id");
  if (!Array.isArray(b?.agents) || !b.agents.length) err.push("agents must be a non-empty array");
  if (b?.days != null && (typeof b.days !== "number" || b.days <= 0)) err.push("days must be a positive number");
  if (b?.hit_cap != null && !["yes", "no", "unsure"].includes(b.hit_cap))
    err.push("hit_cap must be yes, no or unsure");

  for (const a of b?.agents || []) {
    if (typeof a?.agent !== "string") err.push("each agent needs an agent name");
    if (!Array.isArray(a?.models)) err.push(`${a?.agent}: models must be an array`);
    for (const m of a?.models || []) {
      if (typeof m?.model !== "string") err.push("each model entry needs a model id");
      if (!m?.tokens || typeof m.tokens !== "object") err.push(`${m?.model}: tokens object required`);
    }
  }
  return err;
}

const totals = (body) => {
  const t = { input: 0, cache_write: 0, cache_read: 0, output: 0 };
  let turns = 0;
  for (const a of body.agents || []) {
    // Codex reports per session, not per turn, so sessions is the honest floor
    // when a submitter's tooling could not count finer.
    turns += int(a.turns) || int(a.sessions);
    for (const m of a.models || []) {
      for (const k of Object.keys(t)) t[k] += int(m.tokens?.[k]);
    }
  }
  return { ...t, turns };
};

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "body too large", max_bytes: MAX_BODY }, 413);

  let body;
  try { body = JSON.parse(raw); }
  catch { return json({ error: "invalid JSON" }, 400); }

  const errors = validate(body);
  if (errors.length) return json({ error: "invalid measurement", errors }, 422);

  // Content-addressed so the same file posted twice lands on one object rather
  // than inflating the sample count with a duplicate.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const id = [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
  const receivedAt = new Date().toISOString();
  const key = `${body.plan_id}/${receivedAt.slice(0, 10)}/${id}.json`;

  const t = totals(body);
  const agents = (body.agents || []).map((a) => a.agent).join(",");

  await env.ARCHIVE.put(key, raw, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { plan_id: body.plan_id, received_at: receivedAt, schema: body.schema }
  });

  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO measurements
       (id, plan_id, agent, window_hours, days, turns, active_windows,
        usd_total, usd_window_median, usd_window_p90, usd_window_max,
        tokens_input, tokens_cache_write, tokens_cache_read, tokens_output,
        hit_cap, models_json, probe_version, note, received_at, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')`
    ).bind(
      id, body.plan_id, agents, num(body.window_hours), int(body.days) || 0, t.turns,
      num(body.active_windows), num(body.usd_total) ?? 0,
      num(body.usd_window_median), num(body.usd_window_p90), num(body.usd_window_max),
      t.input, t.cache_write, t.cache_read, t.output,
      body.hit_cap ?? "unsure",
      JSON.stringify(body.agents).slice(0, 20000),
      String(body.probe_version ?? "").slice(0, 40),
      String(body.note ?? "").slice(0, 2000),
      receivedAt
    ).run();
  } catch (e) {
    // The object is already durable. Report the index failure rather than
    // pretending the submission was lost.
    return json({ ok: true, id, archived: true, indexed: false, error: String(e) }, 202);
  }

  return json({
    ok: true,
    id,
    plan_id: body.plan_id,
    archived: true,
    indexed: true,
    status: "pending",
    message: "Received and queued for review. Figures move into the catalogue by " +
             "pull request once several independent measurements agree.",
    see: `https://aisubsidy.pages.dev/api/measurements?plan=${body.plan_id}`
  }, 201);
}
