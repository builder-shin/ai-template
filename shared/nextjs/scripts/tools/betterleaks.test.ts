import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { ensureBetterleaks, verifyChecksum } from "./betterleaks";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("SHA-256이 다른 바이너리 압축은 거절한다", () => {
  const data = new TextEncoder().encode("fixture");
  const hash = createHash("sha256").update(data).digest("hex");
  expect(() => verifyChecksum(data, hash)).not.toThrow();
  expect(() => verifyChecksum(data, "bad")).toThrow(/체크섬/);
});

it("이미 설치한 고정 버전 바이너리를 재사용한다", async () => {
  mkdirSync(resolve(".cache"), { recursive: true });
  const root = mkdtempSync(resolve(".cache/binary-test-"));
  roots.push(root);
  const folder = join(root, `betterleaks-1.8.1-${process.platform}-${process.arch}`);
  mkdirSync(folder);
  const binary = join(folder, process.platform === "win32" ? "betterleaks.exe" : "betterleaks");
  writeFileSync(binary, "fixture");
  expect(await ensureBetterleaks(root)).toBe(binary);
});
