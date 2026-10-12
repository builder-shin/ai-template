import { resolve } from "node:path";
import { serve } from "./e2e-serve.js";
const root = resolve(import.meta.dirname, "..");
process.exitCode = await serve([
  "--",
  process.execPath,
  resolve(root, "scripts/preflight-tmp.mjs"),
  resolve(root, "tests/e2e/flows.ts"),
]);
