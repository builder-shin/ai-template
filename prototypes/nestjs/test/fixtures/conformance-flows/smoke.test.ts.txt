import { describe, expect, it } from "vitest";
import { createApiClient } from "../../src/client.ts";
import { MEDIA_TYPE } from "../../src/jsonapi/assertions.ts";
import { resolveTarget } from "../../src/targets.ts";
import { validateSchema } from "../../src/validation.ts";

const target = resolveTarget(process.env);

/** 계약에 없는 경로의 응답을 부르고, 본문이 계약의 에러 문서인지 검증한다. */
async function errorDocument(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${target.baseUrl}${path}`, init);
  const body: unknown = await response.json();
  expect(validateSchema("ErrorDocument", body)).toEqual([]);
  return { status: response.status, contentType: response.headers.get("content-type"), body };
}

describe(`스모크 (${target.name})`, () => {
  it("헬스체크가 계약대로 응답한다", async () => {
    const client = createApiClient({ baseUrl: target.baseUrl });
    expect((await client.GET("/health/live")).response.status).toBe(200);
    expect((await client.GET("/health/ready")).response.status).toBe(200);
  });

  it("/api/v1 아래의 없는 경로는 404 에러 문서다", async () => {
    const result = await errorDocument("/api/v1/does-not-exist", {
      headers: { Accept: MEDIA_TYPE },
    });
    expect(result).toMatchObject({
      status: 404,
      contentType: expect.stringContaining(MEDIA_TYPE) as unknown,
      body: { errors: [{ code: "resource.not_found" }] },
    });
  });

  it("JSON:API가 아닌 Content-Type으로 본문을 보내면 415다", async () => {
    const result = await errorDocument("/api/v1/registrations", {
      method: "POST",
      headers: { Accept: MEDIA_TYPE, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(result).toMatchObject({
      status: 415,
      body: { errors: [{ code: "jsonapi.unsupported_media_type" }] },
    });
  });

  it("매개변수가 붙은 JSON:API 미디어 타입만 받는 Accept는 406이다", async () => {
    const result = await errorDocument("/api/v1/does-not-exist", {
      headers: { Accept: `${MEDIA_TYPE}; ext="https://example.com/ext"` },
    });
    expect(result).toMatchObject({
      status: 406,
      body: { errors: [{ code: "jsonapi.not_acceptable" }] },
    });
  });
});
