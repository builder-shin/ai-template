import { spawnSync } from "node:child_process";
import { realpathSync, mkdirSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** tsx IPC 경로를 실행 전에 확인하고 자식에게만 물리 tmp를 전달한다. */
export function childEnvironment() {
  const physical = realpathSync.native(tmpdir());
  const pipe = join(physical, `tsx-${process.getuid?.() ?? "unknown"}/2147483647.pipe`);
  if (Buffer.byteLength(pipe, "utf8") >= 100) {
    throw new Error("tsx IPC 경로가 너무 길다. 대신 짧은 물리 OS tmp를 사용하라.");
  }
  const evidence = resolve(import.meta.dirname, "../.cache");
  mkdirSync(evidence, { recursive: true });
  appendFileSync(
    join(evidence, "tmp-preflight.jsonl"),
    JSON.stringify({
      utc: new Date().toISOString(),
      physical,
      ipcBytes: Buffer.byteLength(pipe, "utf8"),
    }) + "\n",
  );
  return { ...process.env, TMPDIR: physical };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const script = process.argv[2];
  if (!script) throw new Error("실행할 TypeScript 스크립트를 지정하라.");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", script, ...process.argv.slice(3)],
    {
      env: childEnvironment(),
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
