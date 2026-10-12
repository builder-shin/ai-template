import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { runWithServers, signalController } from "../../../scripts/servers.js";
const dir = process.argv[2] ?? "",
  port = process.argv[3] ?? "";
const signals = signalController();
try {
  const code = await runWithServers({
    servers: ["api", "worker", "scheduler"].map((name, i) => ({
      name,
      argv: [
        process.execPath,
        resolve(import.meta.dirname, "server.mjs"),
        i === 0 ? port : "0",
        resolve(dir, `${name}.json`),
      ],
    })),
    command: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
    serverEnv: process.env,
    commandEnv: process.env,
    serverCwd: dir,
    commandCwd: dir,
    readyUrl: `http://127.0.0.1:${port}/health/ready`,
    signal: signals.signal,
    onStart: (p) => {
      if (p.name === "command")
        writeFileSync(resolve(dir, "command.json"), JSON.stringify(p.child.pid));
    },
  });
  process.exitCode = signals.state.code || code;
} finally {
  signals.close();
}
