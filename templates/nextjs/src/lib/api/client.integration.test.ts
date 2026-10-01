import { once } from "node:events";
import { createServer } from "node:net";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { createApiClient, type ApiLog } from "./client";
import { ApiError, mapApiError, toFormResult } from "./errors";
import { buildQuery, pageLinks, resolveRelationship } from "./jsonapi";

const traceId = "1234567890abcdef1234567890abcdef";
const baseUrl = () => `${inject("mockBaseUrl")}/api/v1`;
let accessToken: string;
beforeAll(async () => {
  const client = createApiClient({ baseUrl: baseUrl(), locale: "en" });
  const { data } = await client.POST("/sessions", {
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
  accessToken = data!.data.attributes.accessToken;
});

describe("실제 목 프로세스의 요청별 API 클라이언트", () => {
  it("연결 실패에도 trace가 있는 ApiError와 안전한 로그를 남긴다", async () => {
    const listener = createServer();
    listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
    const address = listener.address();
    if (!address || typeof address === "string") throw new Error("테스트 포트를 얻지 못했다.");
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    const logs: ApiLog[] = [];
    const client = createApiClient({
      baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
      locale: "en",
      traceId,
      log: (entry) => logs.push(entry),
    });
    const error = (await client.GET("/me").catch((error: unknown) => error)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, traceId, code: "service.unavailable" });
    expect(mapApiError(error)).toEqual({ kind: "unexpected", traceId });
    expect(logs[0]).toMatchObject({ status: 0, path: "/me", traceId });
  });

  it("실제 204 응답은 에러로 바꾸거나 JSON 파싱하지 않는다", async () => {
    const client = createApiClient({ baseUrl: baseUrl(), locale: "en" });
    const session = await client.POST("/sessions", {
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
    const authenticated = createApiClient({
      baseUrl: baseUrl(),
      locale: "en",
      accessToken: session.data!.data.attributes.accessToken,
    });
    const removed = await authenticated.DELETE("/sessions/{id}", {
      params: { path: { id: session.data!.data.id } },
    });
    expect(removed.response.status).toBe(204);
    expect(removed.data).toBeUndefined();
  });

  it("실제 목록의 author와 다음 페이지를 연결한다", async () => {
    const client = createApiClient({ baseUrl: baseUrl(), locale: "en", traceId });
    const { data, response } = await client.GET("/posts", {
      params: {
        query: buildQuery("/posts", { include: ["author"], page: { number: 1, size: 1 } }),
      },
    });
    expect(response.status).toBe(200);
    expect(data?.data).toHaveLength(1);
    const author = resolveRelationship(data!, data!.data[0]!.relationships.author.data);
    expect(author?.attributes.name).toBe("Admin");
    const links = pageLinks(data!);
    expect(links.previous).toBeNull();
    expect(new URL(links.next!, inject("mockBaseUrl")).searchParams.get("page[number]")).toBe("2");
  });

  it("Bearer 토큰을 요청별로 분리하고 토큰 없는 요청은 401 ApiError다", async () => {
    const authenticated = createApiClient({ baseUrl: baseUrl(), locale: "en", accessToken });
    const anonymous = createApiClient({ baseUrl: baseUrl(), locale: "ko", traceId });
    const [me, error] = await Promise.all([
      authenticated.GET("/me"),
      anonymous.GET("/me").catch((error: unknown) => error),
    ]);
    expect(me.data?.data.attributes.email).toBe("admin@example.com");
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "auth.unauthenticated", traceId });
    await expect(
      anonymous.GET("/me", { headers: { Authorization: `Bearer ${accessToken}` } }),
    ).rejects.toMatchObject({ status: 401 });
    expect(mapApiError(error as ApiError)).toEqual({ kind: "login" });
  });

  it("trace를 만들고 호출마다 목으로 전달한다", async () => {
    const logs: ApiLog[] = [];
    const client = createApiClient({
      baseUrl: baseUrl(),
      locale: "ko",
      log: (entry) => logs.push(entry),
    });
    const error = (await client.GET("/me").catch((error: unknown) => error)) as ApiError;
    expect(error.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(error.traceId).not.toBe("0".repeat(32));
    expect(logs[0]?.traceId).toBe(error.traceId);
    expect(logs[0]?.status).toBe(401);
    expect(() => createApiClient({ baseUrl: baseUrl(), locale: "ko", traceId: "bad" })).toThrow();
  });

  it("JSON:API 본문으로 422를 받고 min과 pointer를 필드 번역에 쓴다", async () => {
    const client = createApiClient({ baseUrl: baseUrl(), locale: "en", traceId });
    const error = await client
      .POST("/registrations", {
        body: {
          data: {
            type: "registrations",
            attributes: { name: "", email: "invalid", password: "short" }, // betterleaks:allow 검증 실패용 가짜 비밀번호
          },
        },
      })
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, traceId });
    const result = toFormResult(error as ApiError, "en", ["name", "email", "password"]);
    expect(result.ok).toBe(false);
    expect(result.fieldErrors.email).toEqual(["Enter a value in the correct format."]);
    expect(result.fieldErrors.password).toEqual(["Enter at least 8 characters."]);
  });

  it("Accept-Language로 가입 로케일을 정하고 로그에는 토큰·본문·쿼리를 남기지 않는다", async () => {
    const logs: ApiLog[] = [];
    const client = createApiClient({
      baseUrl: baseUrl(),
      locale: "en",
      accessToken,
      traceId,
      log: (entry) => logs.push(entry),
    });
    const email = "task4-language@example.com";
    const registration = await client.POST("/registrations", {
      headers: {
        "Accept-Language": "ko",
        Accept: "text/html",
        "Content-Type": "application/json",
        Authorization: "Bearer wrong",
      },
      body: {
        data: {
          type: "registrations",
          attributes: { name: "English member", email, password: "task4-test-password" }, // betterleaks:allow 테스트 비밀번호
        },
      },
    });
    expect(registration.response.status).toBe(201);
    const admin = await client.GET("/users/{id}", {
      params: { path: { id: registration.data!.data.relationships.user.data!.id } },
    });
    expect(admin.data?.data.attributes.locale).toBe("en");
    await expect(
      client.GET("/posts/{id}", {
        params: {
          path: { id: "00000000-0000-4000-8000-000000000000" },
          query: { include: "author" },
        },
      }),
    ).rejects.toMatchObject({ status: 404, code: "resource.not_found", traceId });
    expect(logs.map((entry) => entry.status)).toEqual([201, 200, 404]);
    expect(logs[0]).toMatchObject({ method: "POST", path: "/registrations", traceId });
    expect(logs[0]!.durationMs).toBeGreaterThanOrEqual(0);
    const serialized = JSON.stringify(logs);
    for (const secret of [
      accessToken,
      email,
      "task4-test-password",
      "Bearer",
      "include=",
      "00000000-0000-4000-8000-000000000000",
    ])
      expect(serialized).not.toContain(secret);
  });

  it("403과 429도 실제 목 응답에서 안내 정보로 바꾼다", async () => {
    const client = createApiClient({ baseUrl: baseUrl(), locale: "en" });
    const password = "task4-member-password"; // betterleaks:allow 테스트 비밀번호
    const email = "task4-member@example.com";
    await client.POST("/registrations", {
      body: { data: { type: "registrations", attributes: { name: "Member", email, password } } },
    });
    const mail = (await (
      await fetch(`${inject("mockBaseUrl")}/_test/mail?to=${encodeURIComponent(email)}`)
    ).json()) as { messages: { text: string }[] };
    const token = new URL(mail.messages[0]!.text.match(/https?:\/\/\S+/)![0]).searchParams.get(
      "token",
    )!;
    await client.POST("/email-verifications", {
      body: { data: { type: "email-verifications", attributes: { token } } },
    });
    const session = await client.POST("/sessions", {
      body: { data: { type: "sessions", attributes: { grantType: "password", email, password } } },
    });
    const member = createApiClient({
      baseUrl: baseUrl(),
      locale: "en",
      accessToken: session.data!.data.attributes.accessToken,
    });
    const forbidden = await member.GET("/users").catch((error: unknown) => error);
    expect(forbidden).toMatchObject({ status: 403, code: "permission.denied" });
    expect(mapApiError(forbidden as ApiError)).toEqual({ kind: "forbidden" });
    for (let index = 0; index < 3; index++)
      await client.POST("/password-reset-requests", {
        body: { data: { type: "password-reset-requests", attributes: { email } } },
      });
    const limited = await client
      .POST("/password-reset-requests", {
        body: { data: { type: "password-reset-requests", attributes: { email } } },
      })
      .catch((error: unknown) => error);
    expect(limited).toMatchObject({ status: 429, code: "rate_limit.exceeded" });
    expect(mapApiError(limited as ApiError)).toMatchObject({
      kind: "rate-limit",
      retryAfter: expect.any(Number),
    });
  });
});
