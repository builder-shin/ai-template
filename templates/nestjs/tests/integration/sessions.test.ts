import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sessionFixture, sessionDocument, mediaType, errorCode } from "./session-fixture.js";
const collection = (text: string) =>
  z
    .object({
      data: z.array(z.object({ id: z.string(), attributes: z.object({ current: z.boolean() }) })),
    })
    .parse(JSON.parse(text) as unknown);
it("세션 목록은 createdAt·lastUsedAt 정렬을 적용하고 만료·폐기를 제외한다", async () => {
  const f = await sessionFixture();
  const documents = [];
  for (let index = 0; index < 4; index++) {
    const response = await f.login();
    expect(response.status).toBe(201);
    documents.push(sessionDocument(response.text));
  }
  const [first, second, expired, revoked] = documents;
  if (!first || !second || !expired || !revoked) throw new Error("네 세션이 만들어지지 않았다");
  const at = Date.now();
  await f.unit.run(async (tx) => {
    await tx.session.update({
      where: { id: first.data.id },
      data: { createdAt: new Date(at - 10800000), lastUsedAt: new Date(at - 3600000) },
    });
    await tx.session.update({
      where: { id: second.data.id },
      data: { createdAt: new Date(at - 7200000), lastUsedAt: new Date(at - 14400000) },
    });
    await tx.session.update({
      where: { id: expired.data.id },
      data: { expiresAt: new Date(at - 1000) },
    });
    await tx.session.update({
      where: { id: revoked.data.id },
      data: { revokedAt: new Date(at), revokedReason: "revoked" },
    });
  });
  for (const sort of ["-createdAt", "lastUsedAt"]) {
    const response = await f.http
      .get(`/api/v1/sessions?sort=${sort}`)
      .set("Authorization", `Bearer ${first.data.attributes.accessToken}`);
    expect(response.status).toBe(200);
    const doc = collection(response.text);
    expect(doc.data.map((s) => s.id)).toEqual([second.data.id, first.data.id]);
    expect(doc.data.map((s) => s.attributes.current)).toEqual([false, true]);
    expect(response.text).not.toMatch(/accessToken|refreshToken/);
  }
});
it("현재 세션 로그아웃은 204이고 기존 access로 목록을 조회하면 Bearer 401이다", async () => {
  const f = await sessionFixture();
  const response = await f.login();
  expect(response.status).toBe(201);
  const login = sessionDocument(response.text);
  const logout = await f.http
    .delete("/api/v1/sessions/current")
    .set("Authorization", `Bearer ${login.data.attributes.accessToken}`);
  expect(logout.status).toBe(204);
  expect(logout.text).toBe("");
  const rejected = await f.http
    .get("/api/v1/sessions")
    .set("Authorization", `Bearer ${login.data.attributes.accessToken}`);
  expect(rejected.status).toBe(401);
  expect(rejected.headers["www-authenticate"]).toBe("Bearer");
  expect(errorCode(rejected.text)).toBe("auth.token_invalid");
});
it("없는·다른 사용자 id 폐기는 404이고 내 세션의 반복 폐기는 204다", async () => {
  const f = await sessionFixture();
  const firstResponse = await f.login();
  const secondResponse = await f.login();
  expect(firstResponse.status).toBe(201);
  expect(secondResponse.status).toBe(201);
  const first = sessionDocument(firstResponse.text);
  const second = sessionDocument(secondResponse.text);
  const other = await f.unit.run(async (tx) => {
    const user = await tx.user.create({ data: { email: "other-sessions@example.com" } });
    return tx.session.create({
      data: {
        userId: user.id,
        authenticatedAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  });
  for (const id of [randomUUID(), other.id]) {
    const response = await f.http
      .delete(`/api/v1/sessions/${id}`)
      .set("Authorization", `Bearer ${first.data.attributes.accessToken}`);
    expect(response.status).toBe(404);
    expect(errorCode(response.text)).toBe("resource.not_found");
  }
  for (let index = 0; index < 2; index++) {
    const response = await f.http
      .delete(`/api/v1/sessions/${second.data.id}`)
      .set("Authorization", `Bearer ${first.data.attributes.accessToken}`);
    expect(response.status).toBe(204);
  }
});
it.each(["others", "all"] as const)(
  "%s 폐기는 실제 revokedCount와 감사 기록을 남긴다",
  async (scope) => {
    const f = await sessionFixture();
    const firstResponse = await f.login();
    expect(firstResponse.status).toBe(201);
    const first = sessionDocument(firstResponse.text);
    expect((await f.login()).status).toBe(201);
    const response = await f.http
      .post("/api/v1/session-revocations")
      .set("Content-Type", mediaType)
      .set("Authorization", `Bearer ${first.data.attributes.accessToken}`)
      .send({ data: { type: "session-revocations", attributes: { scope } } });
    expect(response.status).toBe(201);
    const count = scope === "others" ? 1 : 2;
    expect(JSON.parse(response.text) as unknown).toMatchObject({
      data: { type: "session-revocations", attributes: { scope, revokedCount: count } },
      meta: { revokedCount: count },
    });
    const audit = await f.unit.run((tx) =>
      tx.auditLog.findMany({ where: { action: "session.all_revoked" } }),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorUserId: f.user.id,
      meta: { scope, revokedCount: count },
    });
    const list = await f.http
      .get("/api/v1/sessions")
      .set("Authorization", `Bearer ${first.data.attributes.accessToken}`);
    expect(list.status).toBe(scope === "others" ? 200 : 401);
  },
);
it("짝 없는 서로게이트 계정에 U+FFFD 비밀번호로 로그인하면 500 없이 Bearer 401이다", async () => {
  const f = await sessionFixture("abcd\ud800xyz");
  const rejected = await f.login("abcd\ufffdxyz");
  expect(rejected.status).toBe(401);
  expect(rejected.headers["www-authenticate"]).toBe("Bearer");
  expect(errorCode(rejected.text)).toBe("auth.invalid_credentials");
  expect((await f.login("abcd\ud800xyz")).status).toBe(201);
});
