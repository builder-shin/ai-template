import { environment } from "../../child-environment.mjs";
import http from "node:http";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { installShutdown } from "../../../src/core/http/shutdown.ts";
import { writeReadiness } from "../../../src/core/runtime/readiness.ts";

const role = process.argv[2];
const server = http.createServer((_req, res) => res.end("ok"));
const grandchild = spawn(process.execPath, ["-e", "setTimeout(()=>{},1000000)"], {
  stdio: "ignore",
});
let closing = false;
installShutdown(server, async () => {
  closing = true;
  await new Promise((resolve) => {
    if (grandchild.exitCode !== null || grandchild.signalCode !== null) return resolve();
    grandchild.once("exit", resolve);
    grandchild.kill("SIGTERM");
  });
});
// 처리기가 설치된 뒤에만 준비 기록을 남긴다.
server.listen(0, "127.0.0.1", () => {
  writeFileSync(
    join(environment().AITPL_READY_DIR, `${role}-observed.json`),
    JSON.stringify({ pid: process.pid, grandchild: grandchild.pid, port: server.address().port }),
  );
  writeReadiness(role);
  if (environment().AITPL_FIXTURE_SECRET) {
    const secret = environment().AITPL_FIXTURE_SECRET;
    process.stdout.write(secret.slice(0, 5));
    setTimeout(() => process.stdout.write(secret.slice(5) + "\n"), 10);
  }
  if (process.argv.includes("early-grandchild")) grandchild.kill("SIGTERM");
  if (process.argv.includes("fail")) setTimeout(() => process.exit(7), 50);
});
process.on("exit", () => {
  if (closing) writeFileSync(join(environment().AITPL_READY_DIR, `${role}-closed`), "처리했다");
});
