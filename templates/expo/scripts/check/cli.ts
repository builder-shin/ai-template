import { stages } from "./stages.ts";
import { pnpmCommand, run } from "../process.mjs";
for (const stage of stages) {
  try {
    run(pnpmCommand([...stage.argv]));
  } catch (error) {
    console.error(`${stage.name}:1 — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
console.log(`Check passed (${stages.length} stages).`);
