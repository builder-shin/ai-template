import createClient from "openapi-fetch";
import { describe, expect, expectTypeOf, inject, it } from "vitest";
import type { components, paths } from "./schema";

describe("§13 #2: openapi-fetch 0.17.0과 실제 JSON:API 목", () => {
  it("미디어 타입을 설정하면 제네릭 문서와 included의 계약 타입을 유지한다", async () => {
    const client = createClient<paths, "application/vnd.api+json">({
      baseUrl: inject("mockBaseUrl"),
      headers: { Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json" },
      bodySerializer: JSON.stringify,
    });
    const result = await client.GET("/api/v1/posts", { params: { query: { include: "author" } } });
    expectTypeOf(result.data).toExtend<
      components["schemas"]["PostCollectionDocument"] | undefined
    >();
    expect(result.response.status).toBe(200);
    expect(result.response.headers.get("content-type")).toContain("application/vnd.api+json");
    expect(result.data?.data.length).toBeGreaterThan(0);
    expect(result.data?.included?.[0]?.type).toBe("users");
    const session = await client.POST("/api/v1/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: {
            grantType: "password",
            email: "admin@example.com",
            password: "admin-password", // betterleaks:allow 테스트 시드
          },
        },
      },
    });
    expectTypeOf(session.data).toEqualTypeOf<
      components["schemas"]["SessionWithTokensDocument"] | undefined
    >();
    expect(session.response.status).toBe(201);
    expect(session.data?.data.attributes.accessToken).toBeTruthy();
    const invalid = await client.POST("/api/v1/registrations", {
      body: {
        data: { type: "registrations", attributes: { name: "", email: "bad", password: "x" } },
      },
    });
    expect(invalid.response.status).toBe(422);
    expect(
      invalid.error?.errors.some((error) => error.source?.pointer === "/data/attributes/email"),
    ).toBe(true);
    const mail = await fetch(`${inject("mockBaseUrl")}/_test/mail?to=bad`);
    expect(mail.status).toBe(200);
    expect(await mail.json()).toEqual({ messages: [] });
  });
});
