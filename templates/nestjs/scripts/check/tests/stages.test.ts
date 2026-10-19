import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { runStages } from "../runner.js";
import { STAGES } from "../stages.js";

it("lint 단계는 경고도 실패로 처리한다", () => {
  expect(STAGES.find((stage) => stage.name === "lint")?.command).toEqual([
    process.execPath,
    "node_modules/eslint/bin/eslint.js",
    ".",
    "--max-warnings",
    "0",
  ]);
});
it("사용하지 않는 억제 주석이 있으면 lint 단계가 실패한다", async () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-lint-warning-"));
  const lint = STAGES.find((stage) => stage.name === "lint");
  if (!lint) throw new Error("lint 단계가 없다");
  const executable = lint.command[1];
  if (!executable) throw new Error("lint 실행 파일이 없다");
  try {
    writeFileSync(
      join(root, "eslint.config.mjs"),
      'export default [{ rules: { "no-console": "error" } }];\n',
    );
    writeFileSync(
      join(root, "fixture.mjs"),
      "// eslint-disable-next-line no-console -- 사유: 사용하지 않는 억제 경고를 검증한다\nexport const value = 1;\n",
    );
    const result = await runStages(
      [{ ...lint, command: [process.execPath, resolve(executable), ...lint.command.slice(2)] }],
      { root, fast: false, cacheDir: join(root, ".cache/check") },
    );
    expect(result).toMatchObject({ ok: false, failed: "lint" });
    expect(result.output).toContain("Unused eslint-disable directive");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
