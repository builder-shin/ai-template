import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const [port, file, mode = "ready"] = process.argv.slice(2);
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
const server = createServer((_req, res) => {
  res.writeHead(mode === "unready" ? 503 : 200);
  res.end("{}");
});
console.error("HEAD-" + "x".repeat(10000) + "-TAIL");
let shutdownRequested = false;
let childClosed = false;
function closeOwnedServer() {
  server.close(() => process.exit(0));
  server.closeAllConnections();
}
child.once("close", () => {
  childClosed = true;
  if (shutdownRequested) closeOwnedServer();
});
process.on("SIGTERM", () => {
  shutdownRequested = true;
  if (childClosed) closeOwnedServer();
  else child.kill("SIGTERM");
});
server.listen(Number(port), "127.0.0.1", () => {
  writeFileSync(file, JSON.stringify([process.pid, child.pid]));
});
if (mode === "die")
  setTimeout(() => {
    child.kill();
    server.close(() => process.exit(7));
  }, 150);
