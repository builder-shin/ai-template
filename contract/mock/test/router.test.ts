/**
 * JSON:API 라우터: 계약에서 읽은 선언(인증, 권한, 쿼리, 경로, 요청 문서)과 에러 우선순위.
 * 이 슬라이스에 없는 operation은 시험용 핸들러로 달아 공통 규칙만 본다.
 */

import { describe, expect, it } from "vitest";
import { bearerToken } from "../src/core/access.ts";
import { operationSpec } from "../src/jsonapi/operations.ts";
import { createJsonApiRouter } from "../src/jsonapi/router.ts";
import { createAuthenticator } from "../src/modules/auth/credentials.ts";
import { newUser, send, signIn } from "./accounts.ts";
import { codesOf, errorsOf, testApp } from "./support.ts";

/** 계약의 operation에 시험용 핸들러를 단 앱. 핸들러는 받은 입력을 JSON으로 돌려준다. */
function probeApp() {
  const setup = testApp();
  const api = createJsonApiRouter(setup.app, createAuthenticator(setup.state));
  api.route("Permissions_list", { auth: "required" }, ({ c, principal, query }) =>
    c.json({ userId: principal.userId, page: query.page }),
  );
  api.route("Roles_update", { auth: "required" }, ({ c, path, document }) =>
    c.json({ path, document }),
  );
  return setup;
}

describe("계약의 operation 선언", () => {
  it("경로, 메서드, 인증, 권한, 쿼리, 요청 문서를 계약에서 읽는다", () => {
    expect(operationSpec("Sessions_list")).toMatchObject({
      method: "GET",
      path: "/api/v1/sessions",
      auth: "required",
      permission: undefined,
      query: { include: [], fields: ["sessions"], sort: ["createdAt", "lastUsedAt"], filters: [] },
      requestDocument: undefined,
    });
    expect(operationSpec("Users_list")).toMatchObject({
      permission: "users:read",
      query: { include: ["roles", "avatar"], filters: ["q", "status", "role"] },
    });
    expect(operationSpec("Sessions_create")).toMatchObject({
      auth: "none",
      requestDocument: "SessionCreateDocument",
    });
    expect(operationSpec("Posts_list").auth).toBe("optional");
    expect(operationSpec("Sessions_delete").pathParameters).toEqual([
      { name: "id", schema: { type: "string", format: "uuid" } },
    ]);
  });

  it("계약과 다른 인증이나 필터로 라우트를 달면 던진다", () => {
    const { app, state } = testApp();
    const api = createJsonApiRouter(app, createAuthenticator(state));
    expect(() => {
      api.route("Sessions_list", { auth: "optional" }, ({ c }) => c.body(null));
    }).toThrow("Sessions_list: 계약의 인증은 required인데 optional로 달았다.");
    expect(() => {
      api.route("Users_list", { auth: "required", filters: {} }, ({ c }) => c.body(null));
    }).toThrow("필터 파서는 계약의 필터(q, status, role)와 같은 순서로 준다.");
  });
});

describe("인증과 권한", () => {
  it.each([
    [undefined, undefined],
    ["Basic abc", undefined],
    ["Bearer", ""],
    ["bearer  token ", "token"],
    ["BEARER a b", "a b"],
  ])("Authorization %s의 토큰은 %s다", (header, token) => {
    expect(bearerToken(header)).toBe(token);
  });

  it("권한이 없으면 403 permission.denied, 있으면 핸들러까지 간다", async () => {
    const { app, state, config } = probeApp();
    const member = await newUser(app, state);
    const denied = await send(app, "GET", "/api/v1/permissions", { token: member.accessToken });
    expect(await errorsOf(denied, 403)).toEqual([
      {
        status: "403",
        code: "permission.denied",
        title: "Forbidden",
        detail: "Permission roles:read is required.",
      },
    ]);
    const admin = await signIn(app, config.seedAdmin.email, config.seedAdmin.password);
    const allowed = await send(app, "GET", "/api/v1/permissions?page%5Bsize%5D=3", {
      token: admin.accessToken,
    });
    expect(await allowed.json()).toEqual({ userId: admin.userId, page: { number: 1, size: 3 } });
  });

  it("권한 검사(403)가 쿼리 오류(400)보다 먼저다", async () => {
    const { app, state } = probeApp();
    const member = await newUser(app, state);
    const response = await send(app, "GET", "/api/v1/permissions?bogus=1", {
      token: member.accessToken,
    });
    expect(await codesOf(response, 403)).toEqual(["permission.denied"]);
  });

  it("틀린 토큰의 401에도 WWW-Authenticate를 붙인다", async () => {
    const { app } = testApp();
    const response = await send(app, "GET", "/api/v1/me", { token: "forged" });
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await codesOf(response, 401)).toEqual(["auth.token_invalid"]);
  });
});

describe("에러 우선순위", () => {
  it("본문이 JSON이 아니면 인증보다 먼저 400이다", async () => {
    const { app } = testApp();
    const response = await app.request("/api/v1/session-revocations", {
      method: "POST",
      body: "{",
      headers: { "Content-Type": "application/vnd.api+json" },
    });
    expect(await codesOf(response, 400)).toEqual(["jsonapi.invalid_document"]);
  });

  it("쿼리 오류가 문서 검증보다 먼저다", async () => {
    const { app } = testApp();
    const response = await send(app, "POST", "/api/v1/registrations?debug=1", {
      document: { data: {} },
    });
    expect(await errorsOf(response, 400)).toEqual([
      {
        status: "400",
        code: "jsonapi.invalid_query",
        title: "Bad Request",
        detail: "Unknown query parameter debug.",
        source: { parameter: "debug" },
      },
    ]);
  });

  it("경로의 id 형식 오류(404)와 문서 오류를 함께 모으고, 상태가 섞이면 400이다", async () => {
    const { app, config } = probeApp();
    const admin = await signIn(app, config.seedAdmin.email, config.seedAdmin.password);
    const token = admin.accessToken;
    const document = { data: { type: "roles", id: "x", attributes: { name: "" } } };
    const mixed = await send(app, "PATCH", "/api/v1/roles/not-a-uuid", {
      document,
      token,
    });
    expect((await errorsOf(mixed, 400)).map((error) => [error.status, error.code])).toEqual([
      ["404", "resource.not_found"],
      ["422", "validation.too_short"],
    ]);
    const valid = { data: { type: "roles", id: "x", attributes: {} } };
    const onlyPath = await send(app, "PATCH", "/api/v1/roles/not-a-uuid", {
      document: valid,
      token,
    });
    expect(await codesOf(onlyPath, 404)).toEqual(["resource.not_found"]);
    const id = "0199A0B2-8C3E-7ABC-8DEF-0123456789AB";
    const accepted = await send(app, "PATCH", `/api/v1/roles/urn:uuid:${id}`, {
      document: valid,
      token,
    });
    expect(await accepted.json()).toEqual({
      path: { id: "0199a0b2-8c3e-7abc-8def-0123456789ab" },
      document: valid,
    });
  });
});
