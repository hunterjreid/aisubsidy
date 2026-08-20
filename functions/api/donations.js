// GET /api/donations - running total, aggregate only.
//
// Counts intents that actually succeeded. An intent that was created and never
// confirmed is somebody opening the page and closing it, which is not a
// donation and is not counted.

const json = (body) =>
  new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300"
    }
  });

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ total: 0, count: 0, currency: "nzd" });
  try {
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
       FROM donations WHERE status = 'succeeded'`).first();
    return json({
      total_minor: row?.total ?? 0,
      total: (row?.total ?? 0) / 100,
      count: row?.count ?? 0,
      currency: "nzd"
    });
  } catch {
    return json({ total: 0, count: 0, currency: "nzd" });
  }
}
