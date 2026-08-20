import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCatalog } from "./lib/catalog.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const catalog = loadCatalog(join(root, "data", "providers"));

if (catalog.errors.length) {
  console.error("catalog invalid:\n");
  for (const e of catalog.errors) console.error("  " + e);
  process.exit(1);
}

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist", "catalog.json"), JSON.stringify(catalog, null, 2));

const { providers, plans, gradeable, opaque } = catalog.stats;
console.log(`ok  ${providers} providers, ${plans} plans`);
console.log(`    ${gradeable} gradeable, ${opaque} opaque (vendor publishes no usable quota)`);
console.log(`    dist/catalog.json`);
