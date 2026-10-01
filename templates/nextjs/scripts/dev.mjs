import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import nextEnv from "@next/env";
import { isStandalone, mockHost } from "./dev-mode.mjs";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
nextEnv.loadEnvConfig(root, true);
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    // 직접 시작한 트리만 종료한다. Windows kill은 자식 프로세스를 남긴다.
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* 이미 종료한 자식은 건너뛴다. */
      }
    }
  }
  process.exitCode = code;
}

function start(name, args, cwd = root, env = process.env) {
  const manifest = require.resolve(`${name}/package.json`);
  const pkg = require(manifest);
  const entry = typeof pkg.bin === "string" ? pkg.bin : pkg.bin[name];
  const child = spawn(process.execPath, [resolve(dirname(manifest), entry), ...args], {
    cwd,
    env,
    stdio: "inherit",
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
if (isStandalone(process.env.API_BASE_URL)) {
  start("tsx", ["src/main.ts"], resolve(root, "contract/mock"), {
    ...process.env,
    PORT: "4010",
    HOST: mockHost(process.env.API_BASE_URL),
    API_URL: new URL(process.env.API_BASE_URL ?? "http://localhost:4010/api/v1").origin,
    FRONTEND_URL: process.env.APP_URL ?? "http://localhost:3000",
  });
}
start("next", ["dev", "--port", "3000"]);
