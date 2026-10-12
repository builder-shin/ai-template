import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const [port, file, mode = "ready"] = process.argv.slice(2);
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
writeFileSync(file, JSON.stringify([process.pid, child.pid]));
const server = createServer((_req, res) => {
  res.writeHead(mode === "unready" ? 503 : 200);
  res.end("{}");
});
server.listen(Number(port), "127.0.0.1");
console.error("HEAD-" + "x".repeat(10000) + "-TAIL");
process.on("SIGTERM", () => {
  child.once("close", () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
  child.kill("SIGTERM");
});
if (mode === "die")
  setTimeout(() => {
    child.kill();
    server.close(() => process.exit(7));
  }, 150);
