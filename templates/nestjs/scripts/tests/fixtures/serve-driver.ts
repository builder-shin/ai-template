import { resolve } from "node:path";
import { runE2eServe } from "../../e2e-serve.js";
import { environment } from "../../child-environment.mjs";
const env = environment();
const command =
  process.argv[2] === "exit"
    ? [process.execPath, "-e", "process.stdout.write(process.cwd());process.exit(23)"]
    : [process.execPath, "-e", "setTimeout(()=>{},1e6)"];
process.exitCode = await runE2eServe(
  { webUrl: "http://localhost:3000", command, cwd: env.AITPL_COMMAND_CWD ?? process.cwd() },
  {
    prepare: async () => {},
    specs: () =>
      (["api", "worker", "scheduler"] as const).map((role) => ({
        role,
        argv: ["--import", "tsx", resolve("scripts/tests/fixtures/server.mjs"), role],
      })),
    readyTimeoutMs: 10000,
    health: async () => {},
  },
);
