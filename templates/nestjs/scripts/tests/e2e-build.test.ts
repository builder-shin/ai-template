import { execFile } from "node:child_process";
import { expect, it } from "vitest";
import { environment } from "../child-environment.mjs";
it("test:e2e의 빌드 준비는 자기 진입 모듈의 평가를 다시 기다리지 않는다", async () => {
  const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      [
        "--env-file=.env.example",
        "--import",
        "./scripts/swc-loader.mjs",
        "--import",
        "./scripts/tests/fixtures/e2e-build-loader.mjs",
        "scripts/test-e2e.ts",
      ],
      { cwd: process.cwd(), env: environment(), timeout: 5000 },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          stdout,
          stderr,
        });
      },
    );
  });
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toContain("준비가 끝났다");
});
