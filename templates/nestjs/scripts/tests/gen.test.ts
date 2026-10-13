import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it } from "vitest";
import { updateOpenApi } from "../gen.js";
import { buildOpenApi } from "../../src/core/jsonapi/openapi/emit.js";
import { operations } from "../../src/core/jsonapi/operation.js";
import { components } from "../../src/core/jsonapi/schemas.js";
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
it("실제 생성 진입점은 오류와 권한 enum도 컴포넌트로 등록한다", () => {
  const doc = buildOpenApi(operations(), components());
  const error = doc.components.schemas.ErrorCode as { enum: unknown[] } | undefined;
  const permission = doc.components.schemas.PermissionCode as { enum: unknown[] } | undefined;
  expect(error?.enum).toEqual(
    expect.arrayContaining([
      "jsonapi.invalid_document",
      "validation.invalid_format",
      "service.unavailable",
    ]),
  );
  expect(permission?.enum).toEqual([
    "admin:access",
    "users:read",
    "users:manage",
    "roles:read",
    "roles:manage",
    "audit-logs:read",
    "posts:create",
    "posts:manage",
  ]);
});
