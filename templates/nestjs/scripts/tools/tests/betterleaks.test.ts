import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ensureBetterleaks, verifyChecksum } from "../betterleaks.js";

const roots: string[] = [];
const cache = () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-betterleaks-"));
  roots.push(root);
  return root;
};
afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
it("체크섬이 다르면 압축을 풀기 전에 거절한다", () => {
  expect(() => {
    verifyChecksum(new Uint8Array([1, 2]), "0".repeat(64));
  }).toThrow("체크섬");
  const bytes = new Uint8Array([1, 2]);
  expect(() => {
    verifyChecksum(bytes, createHash("sha256").update(bytes).digest("hex"));
  }).not.toThrow();
});
it("이미 준비한 버전별 실행 파일은 다운로드 없이 재사용한다", async () => {
  const root = cache();
  const folder = join(root, `betterleaks-1.8.1-${process.platform}-${process.arch}`);
  mkdirSync(folder);
  const binary = join(folder, process.platform === "win32" ? "betterleaks.exe" : "betterleaks");
  writeFileSync(binary, "검사용 캐시");
  vi.stubGlobal("fetch", () => {
    throw new Error("다운로드하면 안 된다");
  });
  expect(await ensureBetterleaks(root)).toBe(binary);
});
it("서버 오류를 알리고 설치 폴더를 만들지 않는다", async () => {
  const root = cache();
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("", { status: 503 })));
  await expect(ensureBetterleaks(root)).rejects.toThrow("503");
  expect(existsSync(join(root, `betterleaks-1.8.1-${process.platform}-${process.arch}`))).toBe(
    false,
  );
});
it("검증되지 않은 응답은 캐시에 쓰지 않는다", async () => {
  const root = cache();
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("변조된 압축")));
  await expect(ensureBetterleaks(root)).rejects.toThrow("체크섬");
  expect(existsSync(join(root, `betterleaks-1.8.1-${process.platform}-${process.arch}`))).toBe(
    false,
  );
});
