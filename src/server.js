import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";
import { loadCatalog } from "./lib/catalog.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const webRoot = join(root, "web");
const PORT = Number(process.env.PORT || 8787);

// Reloaded on every request in dev so editing a data file shows up on refresh.
const fresh = () => loadCatalog(join(root, "data", "providers"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function json(res, body, status = 200) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": "no-store"
  });
  res.end(payload);
}

const routes = {
  "/api/catalog": () => fresh(),
  "/api/providers": () => ({ providers: fresh().providers.map(stripPlans) }),
  "/api/plans": () => ({ plans: fresh().plans }),
  "/api/models": () => ({ models: fresh().models }),
  "/api/stats": () => fresh().stats,
  "/api/health": () => {
    const c = fresh();
    return { ok: c.errors.length === 0, errors: c.errors, ...c.stats };
  }
};

const stripPlans = (p) => {
  const { plans, ...rest } = p;
  return { ...rest, plan_count: plans.length };
};

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (routes[path]) return json(res, routes[path]());

  // /api/plans/<id>
  const planMatch = path.match(/^\/api\/plans\/([a-z0-9-]+)$/);
  if (planMatch) {
    const plan = fresh().plans.find((p) => p.id === planMatch[1]);
    return plan ? json(res, plan) : json(res, { error: "no such plan" }, 404);
  }

  // /api/models/<id>  (ids carry dots, as in gpt-5.6-sol)
  const modelMatch = path.match(/^\/api\/models\/([a-z0-9.-]+)$/);
  if (modelMatch) {
    const model = fresh().models.find((m) => m.id === modelMatch[1]);
    return model ? json(res, model) : json(res, { error: "no such model" }, 404);
  }

  // /api/providers/<slug>
  const provMatch = path.match(/^\/api\/providers\/([a-z0-9-]+)$/);
  if (provMatch) {
    const prov = fresh().providers.find((p) => p.provider === provMatch[1]);
    return prov ? json(res, prov) : json(res, { error: "no such provider" }, 404);
  }

  if (path.startsWith("/api/")) return json(res, { error: "no such route" }, 404);

  // Static, confined to web/
  const rel = path === "/" ? "index.html" : path.replace(/^\/+/, "");
  const file = join(webRoot, normalize(rel));
  if (!file.startsWith(webRoot) || !existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("not found");
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(PORT, () => {
  const c = fresh();
  if (c.errors.length) {
    console.error("catalog has errors, serving anyway:");
    for (const e of c.errors) console.error("  " + e);
  }
  console.log(`aisubsidy on http://localhost:${PORT}`);
  console.log(`  ${c.stats.plans} plans across ${c.stats.providers} providers`);
});
