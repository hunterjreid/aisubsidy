import { mkdirSync, writeFileSync, readdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCatalog } from "./lib/catalog.js";
import { writeSeo } from "./seo.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const catalog = loadCatalog(join(root, "data", "providers"));

if (catalog.errors.length) {
  console.error("catalog invalid:\n");
  for (const e of catalog.errors) console.error("  " + e);
  process.exit(1);
}

// dist/ is what the Pages Function imports. public/ is the static upload root.
mkdirSync(join(root, "dist"), { recursive: true });
mkdirSync(join(root, "public"), { recursive: true });

const compiled = JSON.stringify(catalog, null, 2);
writeFileSync(join(root, "dist", "catalog.json"), compiled);
writeFileSync(join(root, "public", "catalog.json"), compiled);

for (const file of readdirSync(join(root, "web"))) {
  copyFileSync(join(root, "web", file), join(root, "public", file));
}

const seo = writeSeo(root, catalog);

const s = catalog.stats;
console.log(`ok  ${s.providers} vendors, ${s.models} models (${s.coding_models} coding), ${s.plans} plans`);
console.log(`    ${s.priced} models carry a first-party per-token rate, ${s.models - s.priced} do not`);
console.log(`    ${seo.pages} static pages, ${seo.urls} sitemap urls, llms.txt, robots.txt`);
console.log(`    dist/catalog.json, public/`);
