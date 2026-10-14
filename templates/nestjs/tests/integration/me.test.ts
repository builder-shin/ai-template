import { expect, it } from "vitest";
import { z } from "zod";
import { meFixture } from "./me-fixture.js";
import { sessionDocument, mediaType, errorCode } from "./session-fixture.js";
import { connect } from "./realtime-fixture.js";
import { UsersRepository } from "../../src/modules/users/index.js";
const document = (text: string) =>
  z
    .object({
      data: z.object({
        id: z.string(),
        attributes: z.object({
          name: z.string().nullable(),
          locale: z.string(),
          status: z.string(),
        }),
        relationships: z.object({
          avatar: z.object({ data: z.object({ id: z.string() }).nullable() }),
        }),
      }),
      meta: z.object({ permissions: z.array(z.string()) }),
    })
    .parse(JSON.parse(text) as unknown);
it("2초 재인증 창 밖의 refresh는 탈퇴를 풀지 않고 새 로그인은 풀어 준다", async () => {
  const f = await meFixture();
  await f.unit.run((tx) =>
    tx.session.update({
      where: { id: f.session.id },
      data: { authenticatedAt: new Date(Date.now() - 3000) },
    }),
  );
  const refreshed = await f.http
    .post("/api/v1/sessions")
    .set("Content-Type", mediaType)
    .send({
      data: {
        type: "sessions",
        attributes: { grantType: "refreshToken", refreshToken: f.session.attributes.refreshToken },
      },
    });
  expect(refreshed.status).toBe(201);
  const token = sessionDocument(refreshed.text).data.attributes.accessToken;
  const denied = await f.http.delete("/api/v1/me").set("Authorization", `Bearer ${token}`);
  expect(denied.status).toBe(401);
  expect(errorCode(denied.text)).toBe("auth.reauthentication_required");
  const fresh = await f.login();
  expect(fresh.status).toBe(201);
  expect(
    (
      await f.http
        .delete("/api/v1/me")
        .set("Authorization", `Bearer ${sessionDocument(fresh.text).data.attributes.accessToken}`)
    ).status,
  ).toBe(204);
});
it("아바타와 프로필 변경은 실제 me.updated 수신 뒤 내 정보에 반영된다", async () => {
  const f = await meFixture();
  await f.app.listen(0, "127.0.0.1");
  const address = f.app.getHttpServer().address();
  if (!address || typeof address === "string") throw new Error("시험 포트가 없다");
  const socket = await connect(
    `http://127.0.0.1:${String(address.port)}`,
    f.session.attributes.accessToken,
  );
  const file = await f.unit.run((tx) =>
    tx.file.create({
      data: {
        ownerId: f.user.id,
        key: "me-avatar-" + f.user.id,
        filename: "아바타.png",
        contentType: "image/png",
        size: 23n,
        status: "ready",
      },
    }),
  );
  const received = new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("내 정보 이벤트가 오지 않았다"));
    }, 3000);
    socket.once("me.updated", (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  const changed = await f.http
    .patch("/api/v1/me")
    .set("Authorization", `Bearer ${f.session.attributes.accessToken}`)
    .set("Content-Type", mediaType)
    .send({
      data: {
        type: "users",
        id: f.user.id,
        attributes: { name: "바꾼 이름", locale: "en" },
        relationships: { avatar: { data: { type: "files", id: file.id } } },
      },
    });
  expect(changed.status).toBe(200);
  expect(await received).toEqual({ meta: { changed: ["profile"] } });
  const mine = await f.http
    .get("/api/v1/me?include=roles,avatar")
    .set("Authorization", `Bearer ${f.session.attributes.accessToken}`);
  expect(mine.status).toBe(200);
  expect(document(mine.text)).toMatchObject({
    data: {
      attributes: { name: "바꾼 이름", locale: "en" },
      relationships: { avatar: { data: { id: file.id } } },
    },
    meta: { permissions: ["posts:create"] },
  });
  const included = z
    .object({
      included: z.array(
        z.object({ type: z.string(), attributes: z.record(z.string(), z.unknown()) }),
      ),
    })
    .parse(JSON.parse(mine.text) as unknown).included;
  expect(included.find((x) => x.type === "roles")?.attributes).toMatchObject({
    createdAt: expect.any(String) as unknown,
    updatedAt: expect.any(String) as unknown,
  });
  socket.disconnect();
});
it("탈퇴 뒤 로그인은 401이고 공개 사용자와 남은 세션과 토큰은 익명화된다", async () => {
  const f = await meFixture();
  const second = await f.login();
  expect(second.status).toBe(201);
  expect(
    (
      await f.http
        .delete("/api/v1/me")
        .set("Authorization", `Bearer ${f.session.attributes.accessToken}`)
    ).status,
  ).toBe(204);
  expect((await f.login()).status).toBe(401);
  expect(
    (
      await f.http
        .get("/api/v1/me")
        .set("Authorization", `Bearer ${sessionDocument(second.text).data.attributes.accessToken}`)
    ).status,
  ).toBe(401);
  const state = await f.unit.run(async (tx) => ({
    user: await tx.user.findUniqueOrThrow({ where: { id: f.user.id } }),
    sessions: await tx.session.findMany({ where: { userId: f.user.id } }),
    tokens: await tx.refreshToken.count({ where: { session: { userId: f.user.id } } }),
    publicUsers: await new UsersRepository().load(tx, [f.user.id]),
    audit: await tx.auditLog.findMany({
      where: { action: "user.deleted", actorUserId: f.user.id },
    }),
  }));
  expect(state.user).toMatchObject({
    status: "deleted",
    email: null,
    name: null,
    passwordHash: null,
  });
  expect(state.tokens).toBe(0);
  expect(state.sessions.map((s) => s.revokedReason)).toEqual([
    "account_deleted",
    "account_deleted",
  ]);
  expect(state.publicUsers).toEqual([
    {
      type: "users",
      id: f.user.id,
      attributes: { name: null },
      relationships: { avatar: { data: null } },
    },
  ]);
  expect(state.audit).toHaveLength(1);
});
it("마지막 활성 관리자의 탈퇴는 422다", async () => {
  const f = await meFixture("admin");
  const r = await f.http
    .delete("/api/v1/me")
    .set("Authorization", `Bearer ${f.session.attributes.accessToken}`);
  expect(r.status).toBe(422);
  expect(errorCode(r.text)).toBe("role.last_admin_protected");
});
it("관리자 두 명의 동시 탈퇴는 한 명만 성공하고 활성 관리자가 남는다", async () => {
  const f = await meFixture("admin");
  const second = await f.addUser("admin");
  const results = await Promise.all(
    [f.session, second.session].map((s) =>
      f.http.delete("/api/v1/me").set("Authorization", `Bearer ${s.attributes.accessToken}`),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([204, 422]);
  expect(errorCode(results.find((r) => r.status === 422)?.text ?? "")).toBe(
    "role.last_admin_protected",
  );
  expect(
    await f.unit.run((tx) =>
      tx.user.count({
        where: { status: "active", roles: { some: { role: { name: "admin", system: true } } } },
      }),
    ),
  ).toBe(1);
});
