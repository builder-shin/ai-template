import { describe, expect, it } from "vitest";
import {
  assertCollection,
  assertErrorDocument,
  assertMediaType,
  assertSparseFieldset,
  MEDIA_TYPE,
} from "../../src/jsonapi/assertions.ts";
import { validateSchema } from "../../src/validation.ts";
import {
  api,
  type ErrorDocument,
  newUser,
  PASSWORD,
  problems,
  signInAdmin,
  target,
} from "./support.ts";

interface Sent {
  readonly status: number;
  readonly body: unknown;
}

/**
 * 타입 클라이언트가 보내지 못하는 요청(틀린 문서, 계약에 없는 파라미터)을 그대로 보낸다.
 * 응답이 에러면 계약의 에러 문서인지 검사한다.
 */
async function send(
  path: string,
  options: { readonly method?: string; readonly body?: string; readonly token?: string } = {},
): Promise<Sent> {
  const headers: Record<string, string> = { Accept: MEDIA_TYPE };
  if (options.body !== undefined) headers["Content-Type"] = MEDIA_TYPE;
  if (options.token !== undefined) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${target.baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: options.body }),
  });
  assertMediaType(response);
  const body: unknown = await response.json();
  if (response.status >= 400) {
    assertErrorDocument(body, response.status);
    expect(validateSchema("ErrorDocument", body)).toEqual([]);
  }
  return { status: response.status, body };
}

/** 에러 문서의 (코드, source.parameter) 목록. */
function parameters(body: unknown): [string, string | undefined][] {
  return (body as ErrorDocument).errors.map((error) => [error.code, error.source?.parameter]);
}

const REGISTRATION = { email: "someone@example.com", password: PASSWORD, name: "누군가" };

describe(`JSON:API 규칙 (${target.name})`, () => {
  it("JSON이 아니거나 구조가 틀린 문서는 400이다", async () => {
    const broken = await send("/api/v1/registrations", { method: "POST", body: "{" });
    expect(broken.status).toBe(400);
    expect(problems(broken.body as ErrorDocument)).toEqual([
      ["jsonapi.invalid_document", undefined],
    ]);
    const empty = await send("/api/v1/registrations", { method: "POST", body: "{}" });
    expect(problems(empty.body as ErrorDocument)).toEqual([["jsonapi.invalid_document", "/data"]]);
  });

  it("1 MiB(1,048,576바이트)를 넘는 본문은 413 jsonapi.content_too_large이다", async () => {
    const attributes = { ...REGISTRATION, name: "x".repeat(1_048_576) };
    const body = JSON.stringify({ data: { type: "registrations", attributes } });
    const sent = await send("/api/v1/registrations", { method: "POST", body });
    expect(sent.status).toBe(413);
    expect(problems(sent.body as ErrorDocument)).toEqual([
      ["jsonapi.content_too_large", undefined],
    ]);
  });

  it("생성 요청의 type이 엔드포인트와 다르면 409, 클라이언트가 만든 id가 있으면 403이다", async () => {
    const wrongType = await send("/api/v1/registrations", {
      method: "POST",
      body: JSON.stringify({ data: { type: "users", attributes: REGISTRATION } }),
    });
    expect(wrongType.status).toBe(409);
    expect(problems(wrongType.body as ErrorDocument)).toEqual([
      ["resource.conflict", "/data/type"],
    ]);
    const clientId = await send("/api/v1/registrations", {
      method: "POST",
      body: JSON.stringify({
        data: { type: "registrations", id: "mine", attributes: REGISTRATION },
      }),
    });
    expect(clientId.status).toBe(403);
    expect(problems(clientId.body as ErrorDocument)).toEqual([["permission.denied", "/data/id"]]);
  });

  it("판별 유니온(grant)의 필드 오류는 grant 종류와 이름이 같은 필드가 있어도 본문의 위치를 가리킨다", async () => {
    // password grant의 password, refreshToken grant의 refreshToken은 이름이 grant 종류와 같다.
    const login = await api().POST("/api/v1/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: { grantType: "password", email: "bad", password: "x" },
        },
      },
    });
    expect(login.response.status).toBe(422);
    expect(problems(login.error)).toEqual([
      ["validation.invalid_format", "/data/attributes/email"],
    ]);
    // 숫자 refreshToken은 타입 클라이언트가 보내지 못한다.
    const attributes = { grantType: "refreshToken", refreshToken: 5 };
    const refresh = await send("/api/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ data: { type: "sessions", attributes } }),
    });
    expect(refresh.status).toBe(422);
    expect(problems(refresh.body as ErrorDocument)).toEqual([
      ["validation.invalid_format", "/data/attributes/refreshToken"],
    ]);
  });

  it("정수 자리에 숫자 문자열이나 불리언을 보내면 422 validation.invalid_format이다", async () => {
    const { accessToken: token } = await newUser();
    for (const size of ["10", true]) {
      const attributes = { filename: "a.png", contentType: "image/png", size };
      const sent = await send("/api/v1/files", {
        method: "POST",
        body: JSON.stringify({ data: { type: "files", attributes } }),
        token,
      });
      expect(sent.status, String(size)).toBe(422);
      expect(problems(sent.body as ErrorDocument), String(size)).toEqual([
        ["validation.invalid_format", "/data/attributes/size"],
      ]);
    }
  });

  it("허용하지 않은 include, sort, filter, 페이지 값은 400이고 source.parameter가 그 파라미터다", async () => {
    const { accessToken: token } = await signInAdmin();
    const cases: [string, string, string][] = [
      ["include=posts", "jsonapi.unsupported_include", "include"],
      ["sort=password", "jsonapi.unsupported_sort", "sort"],
      ["filter%5Bunknown%5D=x", "jsonapi.invalid_query", "filter[unknown]"],
      ["filter%5Brole%5D=admin", "jsonapi.invalid_query", "filter[role]"],
      ["page%5Bsize%5D=0", "jsonapi.invalid_query", "page[size]"],
    ];
    for (const [query, code, parameter] of cases) {
      const sent = await send(`/api/v1/users?${query}`, { token });
      expect(sent.status, query).toBe(400);
      expect(parameters(sent.body), query).toEqual([[code, parameter]]);
    }
  });

  it("fields[type]을 주면 그 타입의 리소스에 요청한 필드만 담는다", async () => {
    const user = await newUser();
    const sent = await send(
      "/api/v1/me?include=roles&fields%5Busers%5D=name&fields%5Broles%5D=name",
      { token: user.accessToken },
    );
    expect(sent.status).toBe(200);
    assertSparseFieldset(sent.body, { users: ["name"], roles: ["name"] });
    const document = sent.body as { data: { attributes: Record<string, unknown> } };
    expect(Object.keys(document.data.attributes)).toEqual(["name"]);
  });

  it("컬렉션은 페이지 메타와 요청 경로 기준의 상대 페이지 링크를 담는다", async () => {
    const manager = await signInAdmin();
    const { data } = await manager.api.GET("/api/v1/permissions", {
      params: { query: { "page[size]": 3, "page[number]": 2 } },
    });
    assertCollection(data);
    expect(data?.meta.page).toEqual({ number: 2, size: 3, total: 8, totalPages: 3 });
    const page = (number: number) =>
      `/api/v1/permissions?page%5Bsize%5D=3&page%5Bnumber%5D=${String(number)}`;
    expect(data?.links).toEqual({ first: page(1), prev: page(1), next: page(3), last: page(3) });

    const past = await manager.api.GET("/api/v1/permissions", {
      params: { query: { "page[size]": 3, "page[number]": 4 } },
    });
    expect(past.data?.data).toEqual([]);
    expect(past.data?.links.next).toBeNull();
  });

  it("에러 문서는 status, code, title과 meta.traceId를 담는다", async () => {
    const sent = await send("/api/v1/me");
    expect(sent.status).toBe(401);
    const traceId = (sent.body as ErrorDocument).meta.traceId;
    expect(traceId).not.toBe("");
  });
});
