import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it } from "vitest";
import { updateOpenApi } from "../gen.js";
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-task06-gen-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  expect(existsSync(root)).toBe(false);
});
it("생성은 고정 Prettier JSON을 쓰고 같은 선언의 check는 쓰지 않는다", async () => {
  const path = join(root, "openapi.json");
  await updateOpenApi({ openapi: "3.1.0", paths: {} }, path, false);
  const text = readFileSync(path, "utf8");
  expect(text).toBe('{ "openapi": "3.1.0", "paths": {} }\n');
  await expect(updateOpenApi({ openapi: "3.1.0", paths: {} }, path, true)).resolves.toBeUndefined();
  expect(readFileSync(path, "utf8")).toBe(text);
});
it("check에서 선언이 달라지면 실패하고 기존 생성물은 보존한다", async () => {
  const path = join(root, "openapi.json");
  await updateOpenApi({ openapi: "3.1.0" }, path, false);
  await expect(updateOpenApi({ openapi: "wrong" }, path, true)).rejects.toThrow(
    "openapi.json이 선언과 다르다 — pnpm gen을 실행한다",
  );
  expect(readFileSync(path, "utf8")).toBe('{ "openapi": "3.1.0" }\n');
});
it("check에서 생성물이 없으면 실패하고 새 파일을 쓰지 않는다", async () => {
  const path = join(root, "openapi.json");
  await expect(updateOpenApi({}, path, true)).rejects.toThrow(
    "openapi.json이 선언과 다르다 — pnpm gen을 실행한다",
  );
  expect(existsSync(path)).toBe(false);
});
