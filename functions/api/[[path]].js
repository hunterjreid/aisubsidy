// Cloudflare Pages Function serving the same API as src/server.js.
//
// The catalogue is compiled and validated by `node src/build.js` before deploy,
// so this file never parses or validates anything at request time. If the data
// is wrong the build fails and nothing ships.
import catalog from "../../dist/catalog.json";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      // The data changes when a pull request lands, not per request.
      "cache-control": "public, max-age=300, s-maxage=3600"
    }
  });

const stripPlans = ({ plans, ...rest }) => ({ ...rest, plan_count: plans.length });

export function onRequestGet({ params }) {
  // [[path]] gives the segments after /api/
  const parts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const [head, id] = parts;

  switch (head) {
    case "catalog":
      return json(catalog);
    case "stats":
      return json(catalog.stats);
    case "health":
      return json({ ok: catalog.errors.length === 0, errors: catalog.errors, ...catalog.stats });

    case "models":
      if (!id) return json({ models: catalog.models });
      return pick(catalog.models.find((m) => m.id === id), "model");

    case "plans":
      if (!id) return json({ plans: catalog.plans });
      return pick(catalog.plans.find((p) => p.id === id), "plan");

    case "providers":
      if (!id) return json({ providers: catalog.providers.map(stripPlans) });
      return pick(catalog.providers.find((p) => p.provider === id), "provider");

    default:
      return json({ error: "no such route", routes: ROUTES }, 404);
  }
}

const pick = (found, what) => found ? json(found) : json({ error: `no such ${what}` }, 404);

const ROUTES = [
  "/api/catalog", "/api/stats", "/api/health",
  "/api/models", "/api/models/:id",
  "/api/plans", "/api/plans/:id",
  "/api/providers", "/api/providers/:slug"
];
