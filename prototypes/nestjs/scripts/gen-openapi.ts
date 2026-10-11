import "../src/modules/registry.js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { format, resolveConfig } from "prettier";
import { emitOpenApi } from "../src/core/jsonapi/openapi/emit.js";
const file = resolve(import.meta.dirname, "../openapi.json");
const output = await format(JSON.stringify(emitOpenApi()), {
  ...(await resolveConfig(file)),
  parser: "json",
});
if (process.argv.includes("--check")) {
  if (readFileSync(file, "utf8") !== output) {
    console.error("openapi.json is stale. Run pnpm gen.");
    process.exitCode = 1;
  }
} else writeFileSync(file, output);
