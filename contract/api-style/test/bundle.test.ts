import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { at, type Json, validFixture } from "./lint.ts";

const bundlePath = fileURLToPath(new URL("../dist/lint.mjs", import.meta.url));

/** 번들을 별도 Node 프로세스로 돌린다. 스펙은 JSON 파일로 넘긴다(템플릿이 내보내는 형식). */
function runBundle(doc: Json) {
  const file = join(mkdtempSync(join(tmpdir(), "api-style-bundle-")), "openapi.json");
  writeFileSync(file, JSON.stringify(doc));
  return spawnSync(process.execPath, [bundlePath, file], { encoding: "utf8" });
}

describe("dist/lint.mjs (템플릿에 넣는 한 파일짜리 룰셋)", () => {
  it("올바른 스펙은 아무것도 출력하지 않고 통과한다", () => {
    const result = runBundle(validFixture());
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("JSON:API가 아닌 미디어 타입을 규칙 id와 함께 잡는다", () => {
    const doc = validFixture();
    const content = at(doc, "paths", "/api/v1/widgets", "get", "responses", "200", "content");
    content["application/json"] = content["application/vnd.api+json"];
    delete content["application/vnd.api+json"];
    const result = runBundle(doc);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[jsonapi/media-type]");
    expect(result.stderr).toContain("API 스타일 위반 1건");
  });
});
