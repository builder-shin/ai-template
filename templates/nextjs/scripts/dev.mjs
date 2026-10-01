import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import { isStandalone, mockHost } from "./dev-mode.mjs";
import { startProcessTree, stopProcessTree } from "./process-tree.mjs";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
nextEnv.loadEnvConfig(root, true);
const children = [];
let stopping = false;

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  const results = await Promise.allSettled(children.map((child) => stopProcessTree(child)));
  for (const result of results)
    if (result.status === "rejected") {
      console.error(result.reason.message);
      process.exitCode = 1;
    }
}

function start(name, args, cwd = root, env = process.env) {
  const manifest = require.resolve(`${name}/package.json`);
  const pkg = require(manifest);
  const entry = typeof pkg.bin === "string" ? pkg.bin : pkg.bin[name];
  // tsx CLI 런처 대신 현재 node에 로더를 붙여 목을 직접 실행한다.
  const argv =
    name === "tsx"
      ? ["--import", pathToFileURL(require.resolve("tsx")).href, ...args]
      : [resolve(dirname(manifest), entry), ...args];
  const child = startProcessTree(argv, {
    cwd,
    env,
    stdio: "inherit",
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    void stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) void stop(code ?? 1);
  });
}

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void stop();
  });
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
