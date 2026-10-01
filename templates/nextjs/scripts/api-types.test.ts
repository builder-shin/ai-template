import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { binary } from "./process.mjs";

it("계약에 없는 필터·fields·경로·본문과 included 속성은 컴파일 오류다", () => {
  mkdirSync(".cache", { recursive: true });
  const directory = mkdtempSync(".cache/api-types-");
  const file = join(directory, "probe.ts");
  const imports = `
import { createApiClient } from "../../src/lib/api/client";
import { buildQuery, resolveIncluded } from "../../src/lib/api/jsonapi";
import type { components } from "../../src/lib/api/schema";
declare const document: components["schemas"]["PostDocument"];
const client = createApiClient({ baseUrl: "http://localhost/api/v1", locale: "en" });
`;
  const compile = (source: string) => {
    writeFileSync(file, imports + source);
    return binary(
      "tsc",
      [
        "--ignoreConfig",
        "--noEmit",
        "--strict",
        "--noUncheckedIndexedAccess",
        "--exactOptionalPropertyTypes",
        "--skipLibCheck",
        "--module",
        "esnext",
        "--moduleResolution",
        "bundler",
        "--resolveJsonModule",
        "--esModuleInterop",
        "--target",
        "ES2022",
        file,
      ],
      { timeout: 15000 },
    );
  };
  try {
    const valid = compile(`
const query = buildQuery("/posts", { filter: { status: "published" }, fields: { users: ["name"] } });
buildQuery("/me", { fields: { users: ["name"] } });
client.GET("/posts", { params: { query } });
resolveIncluded(document, { type: "users", id: "id" })?.attributes.name;
client.POST("/sessions", { body: { data: { type: "sessions", attributes: { grantType: "refreshToken", refreshToken: "token" } } } });
`);
    expect(valid.status, valid.stdout + valid.stderr).toBe(0);
    for (const [path, options] of [
      ["/me", '{ filter: { status: "published" } }'],
      ["/me", "{ page: { number: 1 } }"],
      ["/sessions/current", '{ fields: { users: ["name"] } }'],
    ]) {
      const absent = compile(`buildQuery("${path}", ${options});`);
      expect.soft(absent.status, options + absent.stdout + absent.stderr).toBe(2);
      if (absent.status !== 0) expect(absent.stdout).toContain("TS2322");
    }
    const invalid = compile(`
buildQuery("/posts", { filter: { status: "invalid_status" } });
buildQuery("/posts", { page: { size: "invalid_page_size" } });
buildQuery("/posts", { filter: { nonexistent_filter: "x" } });
buildQuery("/posts", { fields: { nonexistent_resource: ["name"] } });
client.GET("/nonexistent_path", {});
client.POST("/sessions", { body: { data: { type: "wrong_type", attributes: { grantType: "refreshToken", refreshToken: "token" } } } });
resolveIncluded(document, { type: "users", id: "id" })?.attributes.email;
`);
    expect(invalid.status).toBe(2);
    for (const rejected of [
      "invalid_status",
      "Type 'string' is not assignable to type 'number'",
      "nonexistent_filter",
      "nonexistent_resource",
      "nonexistent_path",
      "wrong_type",
      "email",
    ])
      expect(invalid.stdout).toContain(rejected);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  // 각 tsc 프로세스의 15초 한도와 다섯 번 컴파일하는 테스트 전체 한도를 구분한다.
}, 60000);
