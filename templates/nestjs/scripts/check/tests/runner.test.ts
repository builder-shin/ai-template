import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runStages } from "../runner.js";
import type { Stage, StageName } from "../stages.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-check-runner-"));
  writeFileSync(join(root, "input.ts"), "처음");
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const options = () => ({ fast: false, root, cacheDir: join(root, ".cache/check") });
const stage = (name: StageName, script: string, extra: Partial<Stage> = {}): Stage => ({
  name,
  inputs: ["input.ts"],
  command: [process.execPath, "-e", script],
  ...extra,
});
const record = "require('node:fs').appendFileSync('effects', '실행\\n')";

it("입력과 명령이 같으면 두 번째 실행에서 단계를 건너뛴다", async () => {
  const item = stage("lint", record);
  const first = await runStages([item], options());
  const second = await runStages([item], options());
  expect(first.ok && second.ok).toBe(true);
  expect(second.output).toContain("lint 건너뜀(입력 변화 없음)");
  expect(readFileSync(join(root, "effects"), "utf8")).toBe("실행\n");
  const cache: unknown = JSON.parse(readFileSync(join(root, ".cache/check/lint.json"), "utf8"));
  expect(cache).toMatchObject({ command: item.command });
  expect(cache).toHaveProperty("hash", expect.stringMatching(/^[a-f0-9]{64}$/));
});
it("입력 바이트가 바뀌면 단계를 다시 실행한다", async () => {
  await runStages([stage("lint", record)], options());
  writeFileSync(join(root, "input.ts"), "변경");
  expect((await runStages([stage("lint", record)], options())).ok).toBe(true);
  expect(readFileSync(join(root, "effects"), "utf8")).toBe("실행\n실행\n");
});
it("명령 인수가 바뀌면 단계를 다시 실행한다", async () => {
  await runStages([stage("lint", record)], options());
  await runStages([stage("lint", `${record}; void 0`)], options());
  expect(readFileSync(join(root, "effects"), "utf8")).toBe("실행\n실행\n");
});
it("입력 파일의 추가와 삭제를 감지한다", async () => {
  const item = stage("lint", record, { inputs: ["*.ts"] });
  await runStages([item], options());
  writeFileSync(join(root, "new.ts"), "추가");
  await runStages([item], options());
  rmSync(join(root, "new.ts"));
  await runStages([item], options());
  expect(readFileSync(join(root, "effects"), "utf8")).toBe("실행\n실행\n실행\n");
});
it("실패하면 그 단계 이름과 출력만 돌려주고 뒤 단계를 돌리지 않는다", async () => {
  const result = await runStages(
    [stage("format", "console.error('x'); process.exit(1)"), stage("lint", record)],
    options(),
  );
  expect(result).toMatchObject({ ok: false, failed: "format", output: "x\n" });
  expect(existsSync(join(root, "effects"))).toBe(false);
  expect(existsSync(join(root, ".cache/check/format.json"))).toBe(false);
});
it("성공 뒤 실패한 입력은 성공 캐시로 남기지 않는다", async () => {
  const item = stage(
    "lint",
    `${record}; process.exit(require('node:fs').existsSync('fail') ? 1 : 0)`,
  );
  await runStages([item], options());
  writeFileSync(join(root, "input.ts"), "실패 입력");
  writeFileSync(join(root, "fail"), "");
  expect((await runStages([item], options())).ok).toBe(false);
  rmSync(join(root, "fail"));
  expect((await runStages([item], options())).ok).toBe(true);
  expect(readFileSync(join(root, "effects"), "utf8")).toBe("실행\n실행\n실행\n");
});
it("--fast는 fastSkip 단계의 실행 효과를 만들지 않는다", async () => {
  const result = await runStages([stage("test", record, { fastSkip: true })], {
    ...options(),
    fast: true,
  });
  expect(result.ok).toBe(true);
  expect(result.output).toContain("test 건너뜀(--fast)");
  expect(existsSync(join(root, "effects"))).toBe(false);
  expect(existsSync(join(root, ".cache/check/test.json"))).toBe(false);
});
it("--fast에서도 일반 단위 시험은 실행한다", async () => {
  expect((await runStages([stage("test", record)], { ...options(), fast: true })).ok).toBe(true);
  expect(readFileSync(join(root, "effects"), "utf8")).toBe("실행\n");
});
it("손상된 캐시는 재실행하여 고친다", async () => {
  await runStages([stage("lint", record)], options());
  writeFileSync(join(root, ".cache/check/lint.json"), "{");
  expect((await runStages([stage("lint", record)], options())).ok).toBe(true);
  expect(readFileSync(join(root, "effects"), "utf8")).toBe("실행\n실행\n");
});
it("명령을 찾지 못하면 해당 단계의 실패로 알린다", async () => {
  const result = await runStages(
    [stage("lint", "", { command: [join(root, "없는-명령")] })],
    options(),
  );
  expect(result).toMatchObject({ ok: false, failed: "lint" });
  expect(result.output).toContain("ENOENT");
});
it("생성물을 새로 추적하면 바이트가 같아도 하네스를 다시 실행한다", async () => {
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  mkdirSync(join(root, "src/generated"), { recursive: true });
  writeFileSync(join(root, "src/generated/client.ts"), "export {};\n");
  const item = stage("harness", record, { inputs: ["src"] });
  await runStages([item], options());
  execFileSync("git", ["add", "src/generated/client.ts"], { cwd: root });
  await runStages([item], options());
  expect(readFileSync(join(root, "effects"), "utf8")).toBe("실행\n실행\n");
});

function prepareCli(failLint = false) {
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write("package.json", '{"type":"module"}\n');
  write("node_modules/tsx/package.json", '{"type":"module","exports":"./index.mjs"}\n');
  write("node_modules/tsx/index.mjs", "export {};\n");
  for (const [name, path] of [
    ["format", "node_modules/prettier/bin/prettier.cjs"],
    ["lint", "node_modules/eslint/bin/eslint.js"],
    ["typecheck", "node_modules/typescript/bin/tsc"],
    ["harness", "scripts/check/harness.ts"],
    ["test", "node_modules/vitest/vitest.mjs"],
  ] as const) {
    write(
      path,
      `process.getBuiltinModule('node:fs').appendFileSync('effects', '${name}\\n');` +
        (name === "lint" && failLint
          ? "process.stderr.write('린트 실패\\n'); process.exit(1);"
          : "process.stdout.write('성공 단계 출력\\n');"),
    );
  }
}
const templateRoot = process.cwd();
const loader = createRequire(import.meta.url).resolve("tsx");
function runCli(...args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", loader, join(templateRoot, "scripts/check/cli.ts"), ...args],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
}
it("CLI 성공은 다섯 단계를 차례로 실행하고 한 줄만 출력한다", () => {
  prepareCli();
  const result = runCli();
  expect(result.status).toBe(0);
  expect(result.stdout).toMatch(/^check 통과: 5단계 \d+\.\d{2}s\n$/);
  expect(result.stderr).toBe("");
  expect(readFileSync(join(root, "effects"), "utf8")).toBe(
    "format\nlint\ntypecheck\nharness\ntest\n",
  );
});
it("CLI 실패는 실패 단계 출력만 쓰고 뒤 단계는 실행하지 않는다", () => {
  prepareCli(true);
  const result = runCli();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("린트 실패\n");
  expect(readFileSync(join(root, "effects"), "utf8")).toBe("format\nlint\n");
});
it("CLI --fast도 이 Task의 일반 단위 시험을 실행한다", () => {
  prepareCli();
  const result = runCli("--fast");
  expect(result.status).toBe(0);
  expect(readFileSync(join(root, "effects"), "utf8")).toBe(
    "format\nlint\ntypecheck\nharness\ntest\n",
  );
});
it("CLI는 알 수 없는 인수를 명령 실행 전에 거절한다", () => {
  prepareCli();
  const result = runCli("--없는-옵션");
  expect(result.status).toBe(1);
  expect(result.stderr).toBe("사용법: pnpm check [--fast]\n");
  expect(existsSync(join(root, "effects"))).toBe(false);
});
it.each(["new-root.js", ".claude/hooks/new.mjs"])(
  "새 린트 대상도 성공 캐시를 무효화한다: %s",
  (path) => {
    prepareCli();
    expect(runCli().status).toBe(0);
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), "export {};\n");
    expect(runCli().status).toBe(0);
    const effects = readFileSync(join(root, "effects"), "utf8").split("\n");
    expect(effects.filter((name) => name === "lint")).toHaveLength(2);
  },
);
