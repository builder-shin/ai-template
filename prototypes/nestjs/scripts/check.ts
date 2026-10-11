import { spawnSync } from "node:child_process";
import { globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { childEnvironment } from "./preflight-tmp.mjs";

const root = resolve(import.meta.dirname, "..");
const started = performance.now();
const evidence = resolve(root, ".cache/check");
mkdirSync(evidence, { recursive: true });
function sizeProblems(): string[] {
  return globSync(["src/**/*.ts", "scripts/**/*.{ts,mjs}", "test/**/*.ts", "tests/**/*.ts"], {
    cwd: root,
  })
    .filter((file) => !file.includes("/generated/"))
    .flatMap((file) => {
      const lines = readFileSync(resolve(root, file), "utf8").replace(/\n$/, "").split("\n").length;
      const limit =
        file.startsWith("test/") || file.startsWith("tests/") || file.includes("/tests/")
          ? 600
          : 400;
      return lines > limit
        ? [`${file}: ${String(lines)} lines. 대신 ${String(limit)}줄 이하로 나누어라.`]
        : [];
    });
}

const stages = [
  ["format", ["prettier", "--check", "."]],
  ["lint", ["eslint", "."]],
  ["prisma", ["node", "scripts/preflight-tmp.mjs", "scripts/gen.ts", "--check"]],
  ["typecheck", ["tsc", "--noEmit"]],
  ["size", []],
  ["test", ["vitest", "run"]],
  ["generated", ["node", "scripts/preflight-tmp.mjs", "scripts/gen-openapi.ts", "--check"]],
] as const;
for (const [name, args] of stages) {
  const utcStart = new Date().toISOString();
  const stageStart = performance.now();
  let status: number | null;
  let output: string;
  let stdout: string;
  let stderr = "";
  let signal: string | null = null;
  if (name === "size") {
    const problems = sizeProblems();
    status = problems.length ? 1 : 0;
    output = problems.join("\n");
    stdout = output;
  } else {
    const result = spawnSync("pnpm", ["exec", ...args], {
      cwd: root,
      env: { ...childEnvironment(), NO_COLOR: "1", FORCE_COLOR: "0" },
      encoding: "utf8",
    });
    status = result.status;
    signal = result.signal;
    stdout = result.stdout;
    stderr = result.stderr;
    output = `${result.stdout}${result.stderr}${result.error?.message ?? ""}`;
  }
  // 각 자식이 끝난 뒤 원시 출력과 실제 종료를 보존하며 성공 출력은 한 줄로 유지한다.
  writeFileSync(resolve(evidence, `${name}.stdout.log`), stdout);
  writeFileSync(resolve(evidence, `${name}.stderr.log`), stderr);
  writeFileSync(
    resolve(evidence, `${name}.execution.json`),
    JSON.stringify({
      command: name === "size" ? "internal file-size inspection" : ["pnpm", "exec", ...args],
      utcStart,
      utcEnd: new Date().toISOString(),
      durationMs: performance.now() - stageStart,
      nativeExit: name === "size" ? null : status,
      internalExit: name === "size" ? status : null,
      signal,
    }),
  );
  if (status !== 0) {
    process.stderr.write(`✗ ${name}\n${output.trimEnd()}\n`);
    process.exit(status ?? 1);
  }
}
console.log(`check 통과: 7단계, ${((performance.now() - started) / 1000).toFixed(1)}s`);
