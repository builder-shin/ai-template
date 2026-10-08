import { afterEach, expect, it, vi } from "vitest";
import { binary, pnpm } from "./process.mjs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

afterEach(() => vi.unstubAllEnvs());

it("native 진입점은 node로 다시 감싸지 않고 실행한다", () => {
  vi.stubEnv("npm_execpath", process.execPath);
  const result = pnpm(["--version"]);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe(process.version);
});

it("작업 사본에 설치된 도구의 자체 진입점을 실행한다", () => {
  const project = mkdtempSync(join(tmpdir(), "copy-tool-"));
  const tool = join(project, "node_modules/tsx");
  mkdirSync(tool, { recursive: true });
  writeFileSync(join(project, "package.json"), '{"type":"module"}');
  writeFileSync(join(tool, "package.json"), JSON.stringify({ name: "tsx", bin: "cli.mjs" }));
  writeFileSync(join(tool, "cli.mjs"), 'console.log("copy-tool:" + process.argv[2]);');
  try {
    const result = binary("tsx", ["--version"], { cwd: project, toolRoot: project });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("copy-tool:--version");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
