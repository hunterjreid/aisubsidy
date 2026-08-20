// GET /api/visitors - the traffic numbers, public by default.
//
// A site that argues vendors should publish their numbers cannot keep its own
// private. Everything here is aggregate: day totals, top paths, top referrers,
// countries. There is no per-visitor row to expose because none is stored.
//
//   ?days=30   window, capped at 365

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300"
    }
  });

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "no database bound" }, 503);

  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  try {
    const [totals, daily, paths, referrers, countries] = await Promise.all([
      env.DB.prepare(
        `SELECT COALESCE(SUM(hits),0) AS views, COUNT(DISTINCT day) AS days_with_traffic
         FROM visits WHERE day >= ?`).bind(since).first(),

      env.DB.prepare(
        `SELECT v.day,
                COALESCE(SUM(v.hits),0) AS views,
                (SELECT COUNT(*) FROM visitors_daily d WHERE d.day = v.day) AS visitors
         FROM visits v WHERE v.day >= ? GROUP BY v.day ORDER BY v.day`).bind(since).all(),

      env.DB.prepare(
        `SELECT path, SUM(hits) AS views FROM visits WHERE day >= ?
         GROUP BY path ORDER BY views DESC LIMIT 25`).bind(since).all(),

      env.DB.prepare(
        `SELECT referrer, SUM(hits) AS views FROM visits
         WHERE day >= ? AND referrer <> '' GROUP BY referrer ORDER BY views DESC LIMIT 25`)
        .bind(since).all(),

      env.DB.prepare(
        `SELECT country, SUM(hits) AS views FROM visits WHERE day >= ?
         GROUP BY country ORDER BY views DESC LIMIT 25`).bind(since).all()
    ]);

    const visitors = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM visitors_daily WHERE day >= ?`).bind(since).first();

    return json({
      window_days: days,
      since,
      views: totals?.views ?? 0,
      // Summed across days, so somebody returning on two days counts twice.
      // Stated rather than dressed up as a unique-people figure.
      visitor_days: visitors?.n ?? 0,
      daily: daily.results,
      top_paths: paths.results,
      top_referrers: referrers.results,
      countries: countries.results,
      privacy: "No cookies. No IP stored. Uniqueness is a daily salted hash that " +
               "cannot be reversed or joined across days."
    });
  } catch (e) {
    return json({ error: "query failed", detail: String(e) }, 500);
  }
}
