import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { checkBreaking } from "../../src/spec-compare/breaking.ts";

vi.mock("../../src/tools/cache.ts", () => ({ TOOL_CACHE_DIR: "fixture-tool-cache" }));
vi.mock("../../src/spec-compare/breaking.ts", () => ({
  checkBreaking: vi.fn(() => Promise.resolve({ ok: true, output: "" })),
}));

it("spec-compare는 공통 도구 캐시 경로를 전달한다", async () => {
  const fixture = fileURLToPath(new URL("../fixtures/specs/contract.yaml", import.meta.url));
  const argv = process.argv;
  const code = process.exitCode;
  process.argv = [process.execPath, "cli.ts", fixture, fixture];
  try {
    await import("../../src/spec-compare/cli.ts");
    expect(checkBreaking).toHaveBeenCalledWith(fixture, fixture, "fixture-tool-cache");
    expect(process.exitCode).toBe(0);
  } finally {
    process.argv = argv;
    process.exitCode = code;
  }
});
