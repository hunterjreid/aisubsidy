// /api/requests - what people want added, corrected or built.
//
//   GET  /api/requests?status=open&sort=votes
//   POST /api/requests          { kind, subject, body, source_url? }
//   POST /api/requests?vote=<id>
//
// Open by default and public by default. A catalogue that asks vendors to
// publish their numbers should show its own backlog rather than curate it.
//
// No accounts. A vote is keyed on the same daily salted hash the visit counter
// uses, so one person gets one vote per request per day and nothing
// identifying is stored either way.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store"
    }
  });

export const onRequestOptions = () => json({ ok: true });

const KINDS = ["vendor", "plan", "correction", "feature"];
const LIMITS = { subject: 120, body: 2000, source_url: 300 };

async function voterHash(request, env) {
  const day = new Date().toISOString().slice(0, 10);
  const buf = new TextEncoder().encode([
    request.headers.get("cf-connecting-ip") || "",
    request.headers.get("user-agent") || "",
    day, env.VISIT_SALT || "aisubsidy"
  ].join("|"));
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "no database bound" }, 503);
  const url = new URL(request.url);

  const status = url.searchParams.get("status");
  if (status && !["open", "done", "declined"].includes(status))
    return json({ error: "invalid status" }, 400);

  const sort = url.searchParams.get("sort") === "new"
    ? "created_at DESC" : "votes DESC, created_at DESC";

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, kind, subject, body, source_url, votes, status, created_at
       FROM requests ${status ? "WHERE status = ?" : ""}
       ORDER BY ${sort} LIMIT 200`
    ).bind(...(status ? [status] : [])).all();

    return json({ total: results.length, requests: results });
  } catch (e) {
    return json({ error: "query failed", detail: String(e) }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "no database bound" }, 503);
  const url = new URL(request.url);

  // Voting shares the endpoint so the client needs one origin, not two.
  const voteFor = url.searchParams.get("vote");
  if (voteFor) {
    if (!/^[a-f0-9]{16,32}$/.test(voteFor)) return json({ error: "invalid id" }, 400);
    const voter = await voterHash(request, env);
    try {
      const ins = await env.DB.prepare(
        `INSERT OR IGNORE INTO request_votes (request_id, voter) VALUES (?,?)`
      ).bind(voteFor, voter).run();

      // Only move the counter if the vote was actually new.
      if (ins.meta?.changes) {
        await env.DB.prepare(`UPDATE requests SET votes = votes + 1 WHERE id = ?`)
          .bind(voteFor).run();
      }
      const row = await env.DB.prepare(`SELECT votes FROM requests WHERE id = ?`)
        .bind(voteFor).first();
      if (!row) return json({ error: "no such request" }, 404);
      return json({ ok: true, id: voteFor, votes: row.votes, counted: !!ins.meta?.changes });
    } catch (e) {
      return json({ error: "vote failed", detail: String(e) }, 500);
    }
  }

  let b;
  try { b = await request.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  const errors = [];
  if (!KINDS.includes(b?.kind)) errors.push(`kind must be one of ${KINDS.join(", ")}`);
  for (const f of ["subject", "body"]) {
    if (typeof b?.[f] !== "string" || !b[f].trim()) errors.push(`${f} is required`);
    else if (b[f].length > LIMITS[f]) errors.push(`${f} is over ${LIMITS[f]} characters`);
  }
  if (b?.source_url) {
    if (typeof b.source_url !== "string" || b.source_url.length > LIMITS.source_url)
      errors.push("source_url is too long");
    else if (!/^https:\/\//.test(b.source_url)) errors.push("source_url must be https");
  }
  if (errors.length) return json({ error: "invalid request", errors }, 422);

  // Content addressed, so the same request sent twice is one row rather than
  // two and cannot be used to inflate the board.
  const digest = await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(`${b.kind}|${b.subject.trim().toLowerCase()}`));
  const id = [...new Uint8Array(digest)].slice(0, 10)
    .map((x) => x.toString(16).padStart(2, "0")).join("");

  try {
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO requests (id, kind, subject, body, source_url, created_at)
       VALUES (?,?,?,?,?,?)`
    ).bind(id, b.kind, b.subject.trim(), b.body.trim(),
           b.source_url || null, new Date().toISOString()).run();

    return json({
      ok: true, id, duplicate: !r.meta?.changes,
      message: r.meta?.changes
        ? "Logged. It is public immediately at /api/requests."
        : "Somebody already asked for this. Vote for it instead.",
      see: "https://aisubsidy.pages.dev/api/requests"
    }, r.meta?.changes ? 201 : 200);
  } catch (e) {
    return json({ error: "insert failed", detail: String(e) }, 500);
  }
}
