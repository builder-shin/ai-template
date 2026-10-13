import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

it("--schemas --subset CLI는 공유 컴포넌트의 차이를 종료 코드 1로 알린다", async () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-task06-schema-cli-"));
  const contract = join(root, "contract.json"),
    implementation = join(root, "implementation.json");
  writeFileSync(
    contract,
    JSON.stringify({ components: { schemas: { A: { minLength: 1 }, Missing: {} } } }),
  );
  writeFileSync(
    implementation,
    JSON.stringify({ components: { schemas: { A: { minLength: 2 } } } }),
  );
  const argv = process.argv,
    code = process.exitCode;
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  process.argv = [process.execPath, "cli.ts", "--schemas", "--subset", contract, implementation];
  try {
    vi.resetModules();
    await import("../../src/spec-compare/cli.ts");
    expect(process.exitCode).toBe(1);
    expect(errors.mock.calls).toEqual([["A/minLength: 계약=1, 구현=2"]]);
  } finally {
    process.argv = argv;
    process.exitCode = code;
    errors.mockRestore();
    rmSync(root, { recursive: true, force: true });
  }
});
