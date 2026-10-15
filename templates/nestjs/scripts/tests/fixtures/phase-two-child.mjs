import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const descendant = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
const keepAlive = setInterval(() => {}, 1000);
let stopped;
function stop() {
  stopped ??= new Promise((resolve) => {
    descendant.once("exit", resolve);
    descendant.kill("SIGTERM");
  }).then(() => clearInterval(keepAlive));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
writeFileSync(process.argv[2], JSON.stringify({ pid: process.pid, descendant: descendant.pid }));
