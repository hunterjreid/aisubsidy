// GET /api/measurements - search the submission index.
//
// Reads D1 only. D1 is an index over the R2 archive, so a query here is cheap
// and the archive stays untouched. Filters are all optional and compose.
//
//   ?plan=claude-max-20x   one plan
//   ?agent=claude-code     one agent
//   ?hit_cap=yes           only submitters who actually reached the cap
//   ?status=pending        pending | accepted | rejected
//   ?limit=50&offset=0
//   ?group=plan            aggregate per plan instead of listing rows

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60"
    }
  });

const SAFE = {
  plan: ["plan_id", /^[a-z0-9-]{1,40}$/],
  agent: ["agent", /^[a-z0-9,-]{1,40}$/],
  hit_cap: ["hit_cap", /^(yes|no|unsure)$/],
  status: ["status", /^(pending|accepted|rejected)$/]
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const where = [];
  const bind = [];

  // Only allowlisted columns, only pattern-matched values, always parameterised.
  for (const [param, [column, pattern]] of Object.entries(SAFE)) {
    const v = url.searchParams.get(param);
    if (v == null) continue;
    if (!pattern.test(v)) return json({ error: `invalid ${param}` }, 400);
    where.push(`${column} = ?`);
    bind.push(v);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    if (url.searchParams.get("group") === "plan") {
      // A ceiling can only come from submitters who actually hit the cap, so
      // that count is reported next to the total rather than buried.
      const { results } = await env.DB.prepare(
        `SELECT plan_id,
                COUNT(*)                          AS submissions,
                SUM(hit_cap = 'yes')              AS hit_cap_count,
                SUM(turns)                        AS turns,
                ROUND(AVG(usd_window_p90), 2)     AS avg_usd_window_p90,
                ROUND(MAX(usd_window_max), 2)     AS max_usd_window,
                MIN(received_at)                  AS first_seen,
                MAX(received_at)                  AS last_seen
         FROM measurements ${clause}
         GROUP BY plan_id ORDER BY submissions DESC`
      ).bind(...bind).all();

      return json({
        group: "plan",
        plans: results,
        note: "A submission from somebody who never reached the cap measures a floor, " +
              "not a ceiling. Read hit_cap_count before reading the averages."
      });
    }

    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    const { results } = await env.DB.prepare(
      `SELECT id, plan_id, agent, window_hours, days, turns, active_windows,
              usd_total, usd_window_median, usd_window_p90, usd_window_max,
              tokens_input, tokens_cache_write, tokens_cache_read, tokens_output,
              hit_cap, probe_version, note, received_at, status
       FROM measurements ${clause}
       ORDER BY received_at DESC LIMIT ? OFFSET ?`
    ).bind(...bind, limit, offset).all();

    const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM measurements ${clause}`)
      .bind(...bind).first();

    return json({ total: count?.n ?? 0, limit, offset, measurements: results });
  } catch (e) {
    return json({ error: "query failed", detail: String(e) }, 500);
  }
}
