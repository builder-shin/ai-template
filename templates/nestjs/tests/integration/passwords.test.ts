import "reflect-metadata";
import { afterEach, expect, it } from "vitest";
import request from "supertest";
import { z } from "zod";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createApp } from "../../src/core/http/create-app.js";
import { UnitOfWork } from "../../src/core/db/unit-of-work.js";
import { JobQueue } from "../../src/core/jobs/queue.js";
import { WorkerHost } from "../../src/core/jobs/worker-host.js";
import { SchedulerHost } from "../../src/core/jobs/scheduler-host.js";
import { RolesRepository } from "../../src/modules/roles/index.js";
import { hashPassword } from "../../src/core/security/passwords.js";
import { newOpaqueToken } from "../../src/core/security/tokens.js";
import { purgeExpired } from "../../src/modules/auth/index.js";
import { getState } from "./state.js";
import { mediaType, sessionDocument, errorCode } from "./session-fixture.js";
const owned: { app: NestExpressApplication; host: WorkerHost }[] = [];
afterEach(async () => {
  for (const { app, host } of owned.splice(0)) {
    await host.onModuleDestroy();
    await app.close();
  }
});
const initialPassword = "password-123"; // betterleaks:allow 사유: CI 비밀번호 시험의 가짜 값
const replacementPassword = "replacement-123"; // betterleaks:allow 사유: CI 비밀번호 시험의 가짜 새 값
async function fixture(password = initialPassword) {
  const app = await createApp(
    {
      settings: {
        ...getState().settings,
        RATE_LIMIT_GLOBAL: 600,
        RATE_LIMIT_LOGIN_IP: 50,
        RATE_LIMIT_LOGIN_IDENTIFIER: 50,
        RATE_LIMIT_MAIL_IP: 20,
        RATE_LIMIT_MAIL_EMAIL: 20,
        RATE_LIMIT_PASSWORD_CHANGE_USER: 5,
      },
    },
    true,
  );
  const host = new WorkerHost(app.get(JobQueue));
  owned.push({ app, host });
  const unit = app.get(UnitOfWork);
  const passwordHash = await hashPassword(password);
  const user = await unit.run(async (tx) => {
    const roles = new RolesRepository();
    await roles.seedRoles(tx);
    const user = await tx.user.create({
      data: {
        email: "passwords@example.com",
        passwordHash,
        name: "비밀번호 회원",
        emailVerifiedAt: new Date(),
      },
    });
    await roles.assign(tx, user.id, ["member"]);
    return user;
  });
  await host.start();
  const http = request(app.getHttpServer());
  const post = (type: string, attributes: object, access?: string) => {
    const operation = http.post(`/api/v1/${type}`).set("Content-Type", mediaType);
    if (access) operation.set("Authorization", `Bearer ${access}`);
    return operation.send({ data: { type, attributes } });
  };
  const login = (candidate = password) =>
    post("sessions", { grantType: "password", email: user.email, password: candidate });
  const token = async () => {
    const opaque = newOpaqueToken();
    await unit.run((tx) =>
      tx.verificationToken.create({
        data: {
          userId: user.id,
          purpose: "reset",
          tokenHash: opaque.hash,
          expiresAt: new Date(Date.now() + 3600000),
        },
      }),
    );
    return opaque.token;
  };
  return { app, unit, user, http, post, login, token };
}
async function resetMailTokens(): Promise<string[]> {
  const { mailpitUrl } = getState();
  const list = await fetch(`${mailpitUrl}/api/v1/messages`, { signal: AbortSignal.timeout(5000) });
  if (!list.ok) throw new Error("Mailpit 목록을 읽지 못했다");
  const messages = z
    .object({ messages: z.array(z.object({ ID: z.string() })) })
    .parse(await list.json()).messages;
  const tokens: string[] = [];
  for (const message of messages) {
    const response = await fetch(`${mailpitUrl}/api/v1/message/${message.ID}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Mailpit 메일을 읽지 못했다");
    const body = z.object({ Text: z.string() }).parse(await response.json());
    const match = /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(body.Text);
    if (match?.[1]) tokens.push(match[1]);
  }
  return tokens;
}
it("재설정 메일 링크는 전체 세션을 401로 만들고 새 비밀번호 로그인을 허용하며 남은 토큰은 422다", async () => {
  const f = await fixture();
  const first = await f.login();
  const second = await f.login();
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  const sessions = [sessionDocument(first.text), sessionDocument(second.text)];
  const absent = await f.post("password-reset-requests", { email: "absent@example.com" });
  expect(absent.status).toBe(202);
  expect(absent.text).toBe("");
  const requested = await f.post("password-reset-requests", { email: f.user.email });
  expect(requested.status).toBe(202);
  expect(requested.text).toBe("");
  await expect.poll(async () => (await resetMailTokens()).length, { timeout: 10000 }).toBe(1);
  const [token] = await resetMailTokens();
  expect(token).toBeTruthy();
  const remaining = await f.token();
  const reset = await f.post("password-resets", { token, password: replacementPassword });
  expect(reset.status).toBe(201);
  for (const session of sessions) {
    const rejected = await f.http
      .get("/api/v1/sessions")
      .set("Authorization", `Bearer ${session.data.attributes.accessToken}`);
    expect(rejected.status).toBe(401);
    expect(
      (
        await f.post("sessions", {
          grantType: "refreshToken",
          refreshToken: session.data.attributes.refreshToken,
        })
      ).status,
    ).toBe(401);
  }
  expect((await f.login(replacementPassword)).status).toBe(201);
  expect((await f.login(initialPassword)).status).toBe(401);
  for (const candidate of [token, remaining]) {
    const invalid = await f.post("password-resets", {
      token: candidate,
      password: replacementPassword,
    });
    expect(invalid.status).toBe(422);
    expect(errorCode(invalid.text)).toBe("auth.verification_token_invalid");
  }
});
it("동시 같은 재설정 토큰은 201 하나와 422 하나로 끝나고 500을 만들지 않는다", async () => {
  const f = await fixture();
  const token = await f.token();
  const responses = await Promise.all([
    f.post("password-resets", { token, password: replacementPassword }),
    f.post("password-resets", { token, password: replacementPassword }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 422]);
  expect(errorCode(responses.find((r) => r.status === 422)?.text ?? "")).toBe(
    "auth.verification_token_invalid",
  );
});
it("변경은 현재 access·refresh를 유지하고 다른 세션을 폐기하며 여섯 번째 사용자 변경은 429다", async () => {
  const f = await fixture();
  const first = await f.login();
  const second = await f.login();
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  const current = sessionDocument(first.text);
  const other = sessionDocument(second.text);
  const leftover = await f.token();
  const changed = await f.post(
    "password-changes",
    { currentPassword: initialPassword, newPassword: replacementPassword },
    current.data.attributes.accessToken,
  );
  expect(changed.status).toBe(201);
  expect(
    (
      await f.http
        .get("/api/v1/sessions")
        .set("Authorization", `Bearer ${current.data.attributes.accessToken}`)
    ).status,
  ).toBe(200);
  expect(
    (
      await f.post("sessions", {
        grantType: "refreshToken",
        refreshToken: current.data.attributes.refreshToken,
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await f.http
        .get("/api/v1/sessions")
        .set("Authorization", `Bearer ${other.data.attributes.accessToken}`)
    ).status,
  ).toBe(401);
  expect(
    (
      await f.post("sessions", {
        grantType: "refreshToken",
        refreshToken: other.data.attributes.refreshToken,
      })
    ).status,
  ).toBe(401);
  expect(
    (await f.post("password-resets", { token: leftover, password: replacementPassword })).status,
  ).toBe(422);
  for (let attempt = 2; attempt <= 6; attempt++) {
    const response = await f.post(
      "password-changes",
      { currentPassword: replacementPassword, newPassword: replacementPassword },
      current.data.attributes.accessToken,
    );
    expect(response.status).toBe(attempt === 6 ? 429 : 201);
    if (attempt === 6) expect(errorCode(response.text)).toBe("rate_limit.exceeded");
  }
});
it("짝 없는 서로게이트 currentPassword는 같은 바이트만 허용하며 500을 만들지 않는다", async () => {
  const password = "abcd\ud800xyz"; // betterleaks:allow 사유: CI 서로게이트 시험의 가짜 비밀번호
  const f = await fixture(password);
  const login = await f.login();
  expect(login.status).toBe(201);
  const session = sessionDocument(login.text);
  const wrongPassword = "abcd\ufffdxyz"; // betterleaks:allow 사유: 서로게이트와 다른 바이트의 가짜 비밀번호
  const invalid = await f.post(
    "password-changes",
    { currentPassword: wrongPassword, newPassword: replacementPassword },
    session.data.attributes.accessToken,
  );
  expect(invalid.status).toBe(401);
  expect(errorCode(invalid.text)).toBe("auth.invalid_credentials");
  expect(
    (
      await f.post(
        "password-changes",
        { currentPassword: password, newPassword: replacementPassword },
        session.data.attributes.accessToken,
      )
    ).status,
  ).toBe(201);
});
it("만료 정리는 세션의 refresh를 cascade하고 살아 있는 토큰·세션을 보존한다", async () => {
  const f = await fixture();
  const login = await f.login();
  expect(login.status).toBe(201);
  const session = sessionDocument(login.text);
  const now = new Date();
  await f.unit.run((tx) =>
    tx.session.update({ where: { id: session.data.id }, data: { expiresAt: now } }),
  );
  await f.token();
  expect(await f.unit.run((tx) => purgeExpired(tx, now))).toEqual({ sessions: 1, tokens: 0 });
  const remaining = await f.unit.run(async (tx) => ({
    refresh: await tx.refreshToken.count({ where: { sessionId: session.data.id } }),
    tokens: await tx.verificationToken.count({ where: { userId: f.user.id } }),
  }));
  expect(remaining).toEqual({ refresh: 0, tokens: 1 });
});
it("auth.purge_expired는 Job Scheduler에 UTC 매일 3시 항목 하나로 등록된다", async () => {
  const f = await fixture();
  const queue = f.app.get(JobQueue);
  const scheduler = new SchedulerHost(queue);
  await scheduler.start();
  await scheduler.start();
  expect(
    (await queue.queue.getJobSchedulers()).filter((s) => s.key === "auth.purge_expired"),
  ).toEqual([
    expect.objectContaining({ key: "auth.purge_expired", pattern: "0 3 * * *", tz: "UTC" }),
  ]);
});
