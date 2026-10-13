import { join } from "node:path";
import { runStages } from "../../runner.js";

const root = process.cwd();
const result = await runStages(
  [
    {
      name: "harness",
      inputs: ["src"],
      command: [process.execPath, "-e", "require('node:fs').appendFileSync('effects', '실행\\n')"],
    },
  ],
  { fast: false, root, cacheDir: join(root, ".cache/check") },
);
if (!result.ok) {
  process.stderr.write(result.output);
  process.exitCode = 1;
}
