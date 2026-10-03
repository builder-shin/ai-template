import { existsSync, rmSync } from "node:fs";
import { expect, it, vi } from "vitest";
import config from "../vitest.config.ts";
import { cleanupFolders, temporaryFolder } from "./helpers.ts";

vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, rmSync: vi.fn(fs.rmSync) };
});
const actual = await vi.importActual<typeof import("node:fs")>("node:fs");

it("무거운 snapshot hook에도 테스트와 같은 30초를 준다", () => {
  expect(config.test?.hookTimeout).toBe(30_000);
});

it("테스트 폴더 정리는 재시도하고 실패한 경로를 모은 뒤에도 나머지를 지운다", () => {
  const locked = [temporaryFolder(), temporaryFolder()];
  const removable = temporaryFolder();
  vi.mocked(rmSync).mockImplementation((path, options) => {
    if (locked.includes(String(path))) throw new Error("locked");
    actual.rmSync(path, options);
  });
  try {
    let failure: unknown;
    try {
      cleanupFolders();
    } catch (error) {
      failure = error;
    }
    expect(existsSync(removable)).toBe(false);
    for (const folder of locked) {
      expect(String(failure)).toContain(folder);
      expect(rmSync).toHaveBeenCalledWith(folder, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
    expect(String(failure)).not.toContain(removable);
  } finally {
    vi.mocked(rmSync).mockImplementation(actual.rmSync);
    for (const folder of locked) actual.rmSync(folder, { recursive: true, force: true });
    actual.rmSync(removable, { recursive: true, force: true });
  }
});
