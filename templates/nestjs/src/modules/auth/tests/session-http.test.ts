import "reflect-metadata";
import { beforeAll, expect, it, vi } from "vitest";
import { testApp, mediaType, errorDocument } from "../../../core/http/tests/fixtures.js";
import { PRINCIPAL_RESOLVER } from "../../../core/security/principal.js";
import { hashPassword } from "../../../core/security/passwords.js";
import { SessionsService } from "../index.js";
import { sessionFixture } from "./session-fixtures.js";
import { sessionCreateDocumentSchema } from "../index.js";
import { buildOpenApi } from "../../../core/jsonapi/openapi/emit.js";
import { operations } from "../../../core/jsonapi/operation.js";
import { components } from "../../../core/jsonapi/schemas.js";
const password = "password-123"; // betterleaks:allow 사유: 메모리 HTTP fixture의 가짜 비밀번호
let hash: string;
beforeAll(async () => {
  hash = await hashPassword(password);
});
const body = (attributes: object) => ({ data: { type: "sessions", attributes } });
it("SessionGrant의 OpenAPI는 object와 세 grant의 oneOf·discriminator를 계약대로 선언한다", async () => {
  await testApp([]);
  const document = buildOpenApi(operations(), components());
  expect(document.components.schemas.SessionGrant).toMatchObject({
    type: "object",
    oneOf: [
      { $ref: "#/components/schemas/SessionPasswordGrant" },
      { $ref: "#/components/schemas/SessionRefreshTokenGrant" },
      { $ref: "#/components/schemas/SessionOAuthCodeGrant" },
    ],
    discriminator: {
      propertyName: "grantType",
      mapping: {
        password: "#/components/schemas/SessionPasswordGrant", // betterleaks:allow 사유: discriminator의 기대 스키마 경로다
        refreshToken: "#/components/schemas/SessionRefreshTokenGrant",
        oauthCode: "#/components/schemas/SessionOAuthCodeGrant",
      },
    },
  });
});
it("비밀번호 grant는 빈 비밀번호와 서로게이트를 문자열 그대로 받아 도메인 검증으로 넘긴다", () => {
  for (const password of ["", "a\ud800b"])
    expect(
      sessionCreateDocumentSchema.parse(
        body({ grantType: "password", email: "member@example.com", password }),
      ),
    ).toEqual(body({ grantType: "password", email: "member@example.com", password }));
});
it("알 수 없는 grantType의 실제 Zod 이슈는 grantType 경로다", () => {
  const parsed = sessionCreateDocumentSchema.safeParse(body({ grantType: "unknown" }));
  expect(parsed.success).toBe(false);
  if (!parsed.success)
    expect(parsed.error.issues.map((i) => ({ code: i.code, path: i.path }))).toEqual([
      { code: "invalid_union", path: ["data", "attributes", "grantType"] },
    ]);
});
it.each(["unknown", "\ud800"])(
  "grantType %s 오류의 HTTP 상태·code·pointer가 계약과 같다",
  async (grantType) => {
    const { http } = await testApp([]);
    const response = await http
      .post("/api/v1/sessions")
      .set("Content-Type", mediaType)
      .send(body({ grantType }));
    expect(response.status).toBe(422);
    expect(errorDocument(response.text).errors[0]).toMatchObject({
      status: "422",
      code: grantType === "unknown" ? "validation.invalid_choice" : "validation.invalid_format",
      source: { pointer: "/data/attributes/grantType" },
    });
  },
);
it("세션 목록은 인증이 없으면 Bearer 401이다", async () => {
  const { http } = await testApp([]);
  const response = await http.get("/api/v1/sessions");
  expect(response.status).toBe(401);
  expect(response.headers["www-authenticate"]).toBe("Bearer");
});
async function fixture() {
  const f = sessionFixture();
  f.addUser({ passwordHash: hash });
  const app = await testApp([], {
    providers: [{ provide: PRINCIPAL_RESOLVER, useValue: f.resolver }],
  });
  const target = app.app.get(SessionsService);
  for (const key of [
    "createWithPassword",
    "refresh",
    "list",
    "revokeCurrent",
    "revoke",
    "revokeOthers",
    "revokeAll",
  ] as const)
    target[key] = f.service[key].bind(f.service) as never;
  const post = (attributes: object) =>
    app.http.post("/api/v1/sessions").set("Content-Type", mediaType).send(body(attributes));
  return { ...app, f, post };
}
type SessionDocument = {
  data: { id: string; attributes: { accessToken: string; refreshToken: string } };
};
it("유효한 OAuth grant는 Task 14 전까지 명시적 503이고 비밀번호·refresh·세션 작업을 호출하지 않는다", async () => {
  const f = await fixture();
  const sessions = f.app.get(SessionsService);
  const password = vi.spyOn(sessions, "createWithPassword");
  const refresh = vi.spyOn(sessions, "refresh");
  try {
    const response = await f.post({
      grantType: "oauthCode",
      code: "one-time-code",
      codeVerifier: "verifier",
    });
    expect(response.status).toBe(503);
    expect(response.headers["content-type"]).toBe(mediaType);
    expect(errorDocument(response.text).errors[0]).toMatchObject({
      status: "503",
      code: "service.unavailable",
    });
    expect(password).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(f.f.state.sessions).toEqual([]);
    expect(f.f.state.refresh).toEqual([]);
    expect(f.f.events).toEqual([]);
    expect(f.f.limits).toEqual([]);
  } finally {
    password.mockRestore();
    refresh.mockRestore();
  }
});
it("로그인·refresh는 201이고 현재 로그아웃 경로가 id 경로보다 우선해 204 뒤 access를 거절한다", async () => {
  const f = await fixture();
  const logged = await f.post({ grantType: "password", email: "member@example.com", password });
  expect(logged.status).toBe(201);
  const first = JSON.parse(logged.text) as SessionDocument;
  const refreshed = await f.post({
    grantType: "refreshToken",
    refreshToken: first.data.attributes.refreshToken,
  });
  expect(refreshed.status).toBe(201);
  const next = JSON.parse(refreshed.text) as SessionDocument;
  const logout = await f.http
    .delete("/api/v1/sessions/current")
    .set("Authorization", `Bearer ${next.data.attributes.accessToken}`);
  expect(logout.status).toBe(204);
  expect(logout.text).toBe("");
  const rejected = await f.http
    .get("/api/v1/sessions")
    .set("Authorization", `Bearer ${next.data.attributes.accessToken}`);
  expect(rejected.status).toBe(401);
  expect(rejected.headers["www-authenticate"]).toBe("Bearer");
});
it("세션 목록 희소 필드와 폐기 문서는 revokedCount를 속성과 meta에 담는다", async () => {
  const f = await fixture();
  const first = await f.post({ grantType: "password", email: "member@example.com", password });
  expect(first.status).toBe(201);
  const logged = JSON.parse(first.text) as SessionDocument;
  expect(
    (await f.post({ grantType: "password", email: "member@example.com", password })).status,
  ).toBe(201);
  const list = await f.http
    .get("/api/v1/sessions?fields[sessions]=current&sort=-lastUsedAt")
    .set("Authorization", `Bearer ${logged.data.attributes.accessToken}`);
  expect(list.status).toBe(200);
  const doc = JSON.parse(list.text) as { data: { attributes: object; relationships?: object }[] };
  expect(doc.data).toHaveLength(2);
  expect(
    doc.data.every((d) => Object.keys(d.attributes).join(",") === "current" && !d.relationships),
  ).toBe(true);
  const revoke = await f.http
    .post("/api/v1/session-revocations")
    .set("Content-Type", mediaType)
    .set("Authorization", `Bearer ${logged.data.attributes.accessToken}`)
    .send({ data: { type: "session-revocations", attributes: { scope: "others" } } });
  expect(revoke.status).toBe(201);
  expect(JSON.parse(revoke.text) as unknown).toMatchObject({
    data: { type: "session-revocations", attributes: { scope: "others", revokedCount: 1 } },
    meta: { revokedCount: 1 },
  });
});
