import "reflect-metadata";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, it } from "vitest";
import request from "supertest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { PrismaService } from "../../src/core/db/prisma.service.js";
import { advisoryXactLock } from "../../src/core/db/locks.js";
import { createApp } from "../../src/core/http/create-app.js";
import { hashPassword } from "../../src/core/security/passwords.js";
import { getState } from "./state.js";

const apps: NestExpressApplication[] = [];
const databases: PrismaService[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const db of databases.splice(0)) await db.$disconnect();
});
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}
async function waitingFor(holderPid: number) {
  const until = performance.now() + 5000;
  while (performance.now() < until) {
    const rows = await getState().prisma.$queryRaw<{ blocked: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM pg_locks AS waiting
        WHERE waiting.locktype = 'advisory' AND NOT waiting.granted
          AND ${holderPid} = ANY(pg_blocking_pids(waiting.pid))
      ) AS blocked
    `;
    if (rows[0]?.blocked) return;
    await delay(10);
  }
  throw new Error("로그인의 사용자 잠금 대기를 관찰하지 못했다");
}
it("비밀번호 재설정과 겹친 이전 비밀번호 로그인은 사용자 잠금을 기다린 뒤 거절된다", async () => {
  const { settings, prisma } = getState();
  const app = await createApp({ settings }, true);
  apps.push(app);
  const holder = new PrismaService(settings);
  databases.push(holder);
  const oldPassword = "old-password-123"; // betterleaks:allow 사유: CI 경합 시험의 가짜 비밀번호
  const user = await prisma.user.create({
    data: {
      email: "login-race@example.test",
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword(oldPassword),
    },
  });
  await prisma.session.create({
    data: {
      userId: user.id,
      authenticatedAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const locked = gate(),
    release = gate();
  let holderPid = 0;
  let updatePassword = false;
  const reset = holder.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const row = rows[0];
      if (!row) throw new Error("DB 연결 PID가 없다");
      holderPid = row.pid;
      await advisoryXactLock(tx, `auth:verification:${user.id}`);
      locked.open();
      await release.promise;
      if (updatePassword) {
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword("new-password-123") }, // betterleaks:allow 사유: CI 경합 시험의 새 가짜 비밀번호
        });
        await tx.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: "password_reset" },
        });
      }
    },
    { timeout: 10000 },
  );
  let login: Promise<request.Response> | undefined;
  try {
    await Promise.race([
      locked.promise,
      reset.then(() => {
        throw new Error("사용자 잠금을 얻지 못했다");
      }),
    ]);
    login = request(app.getHttpServer())
      .post("/api/v1/sessions")
      .set("Content-Type", "application/vnd.api+json")
      .send({
        data: {
          type: "sessions",
          attributes: { grantType: "password", email: user.email, password: oldPassword },
        },
      })
      .then((response) => response);
    await waitingFor(holderPid);
    updatePassword = true;
    release.open();
    await reset;
    const response = await login;
    expect(response.status).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(response.body).toMatchObject({ errors: [{ code: "auth.invalid_credentials" }] });
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  } finally {
    release.open();
    await Promise.allSettled([reset, ...(login ? [login] : [])]);
  }
});
