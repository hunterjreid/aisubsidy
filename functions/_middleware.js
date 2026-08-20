// Visit counting, on every page request.
//
// No cookie, no per-request log, no address stored. The unique key is a hash of
// IP + user agent + the day + a rotating salt, so it cannot be reversed, cannot
// be joined across days, and is kept as a set membership rather than a row per
// person. That answers "how many people" without holding anything worth
// leaking, and it needs no consent banner because there is nothing to consent
// to.
//
// Counting happens after the response is produced and is fired with waitUntil,
// so a database hiccup can never delay or break a page load.

const SKIP = /^\/(api|favicon|robots|sitemap|llms|logos|catalog|skill)/;

async function hash(...parts) {
  const buf = new TextEncoder().encode(parts.join("|"));
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A referrer is kept as a bare host. Full URLs carry query strings, and query
// strings carry things people did not mean to send.
function refHost(ref) {
  if (!ref) return "";
  try {
    const h = new URL(ref).host.replace(/^www\./, "");
    return h === "aisubsidy.pages.dev" ? "" : h.slice(0, 60);
  } catch { return ""; }
}

async function record(env, request) {
  if (!env.DB) return;
  const url = new URL(request.url);
  const path = url.pathname.slice(0, 120);
  const day = new Date().toISOString().slice(0, 10);
  const country = (request.headers.get("cf-ipcountry") || "??").slice(0, 2);
  const ref = refHost(request.headers.get("referer"));

  const visitor = await hash(
    request.headers.get("cf-connecting-ip") || "",
    request.headers.get("user-agent") || "",
    day,
    env.VISIT_SALT || "aisubsidy"
  );

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO visits (day, path, country, referrer, hits) VALUES (?,?,?,?,1)
       ON CONFLICT(day, path, country, referrer) DO UPDATE SET hits = hits + 1`
    ).bind(day, path, country, ref),
    env.DB.prepare(
      `INSERT OR IGNORE INTO visitors_daily (day, visitor) VALUES (?,?)`
    ).bind(day, visitor)
  ]);
}

export async function onRequest(context) {
  const { request, env, next, waitUntil } = context;
  const response = await next();

  const url = new URL(request.url);
  const countable =
    request.method === "GET" &&
    !SKIP.test(url.pathname) &&
    response.status < 400 &&
    (response.headers.get("content-type") || "").includes("text/html");

  if (countable) waitUntil(record(env, request).catch(() => {}));
  return response;
}
