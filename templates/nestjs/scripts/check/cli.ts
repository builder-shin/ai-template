import { join } from "node:path";
import { runStages } from "./runner.js";
import { STAGES } from "./stages.js";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--fast")) {
  process.stderr.write("사용법: pnpm check [--fast]\n");
  process.exitCode = 1;
} else {
  const root = process.cwd();
  const result = await runStages(STAGES, {
    fast: args.includes("--fast"),
    root,
    cacheDir: join(root, ".cache/check"),
  });
  if (result.ok)
    process.stdout.write(
      `check 통과: ${String(STAGES.length)}단계 ${result.seconds.toFixed(2)}s\n`,
    );
  else {
    process.stderr.write(result.output);
    process.exitCode = 1;
  }
}
