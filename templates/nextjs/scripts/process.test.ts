import { afterEach, expect, it, vi } from "vitest";
import { pnpm } from "./process.mjs";

afterEach(() => vi.unstubAllEnvs());

it("native 진입점은 node로 다시 감싸지 않고 실행한다", () => {
  vi.stubEnv("npm_execpath", process.execPath);
  const result = pnpm(["--version"]);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe(process.version);
});
