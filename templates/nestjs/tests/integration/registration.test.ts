import "reflect-metadata";
import { afterEach, expect, it } from "vitest";
import request from "supertest";
import { z } from "zod";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createApp } from "../../src/core/http/create-app.js";
import { UnitOfWork } from "../../src/core/db/unit-of-work.js";
import { JobQueue } from "../../src/core/jobs/queue.js";
import { WorkerHost } from "../../src/core/jobs/worker-host.js";
import { RolesRepository } from "../../src/modules/roles/index.js";
import { verifyPassword } from "../../src/core/security/passwords.js";
import { getState } from "./state.js";
const owned: { app: NestExpressApplication; host: WorkerHost }[] = [];
afterEach(async () => {
  for (const { app, host } of owned.splice(0)) {
    await host.onModuleDestroy();
    await app.close();
  }
});
async function fixture() {
  const { settings } = getState();
  const app = await createApp({
    settings: {
      ...settings,
      RATE_LIMIT_GLOBAL: 600,
      RATE_LIMIT_REGISTRATION_IP: 20,
      RATE_LIMIT_MAIL_IP: 20,
      RATE_LIMIT_MAIL_EMAIL: 20,
    },
  });
  const host = new WorkerHost(app.get(JobQueue));
  owned.push({ app, host });
  await app.get(UnitOfWork).run((tx) => new RolesRepository().seedRoles(tx));
  await host.start();
  const http = request(app.getHttpServer());
  const post = (path: string, type: string, attributes: object) =>
    http
      .post(`/api/v1/${path}`)
      .set("Content-Type", "application/vnd.api+json")
      .send({ data: { type, attributes } });
  return {
    app,
    post,
    register: (
      email = "registration@example.com",
      password = "password-123", // betterleaks:allow 사유: CI 가입 fixture의 가짜 비밀번호
    ) => post("registrations", "registrations", { email, password, name: "가입자", locale: "ko" }),
  };
}
async function messages() {
  const response = await fetch(`${getState().mailpitUrl}/api/v1/messages`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Mailpit 목록을 읽지 못했다");
  return z
    .object({ messages: z.array(z.object({ ID: z.string(), Subject: z.string() })) })
    .parse(await response.json()).messages;
}
async function verificationTokens() {
  const tokens: string[] = [];
  for (const message of await messages()) {
    const response = await fetch(`${getState().mailpitUrl}/api/v1/message/${message.ID}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Mailpit 메일을 읽지 못했다");
    const body = z.object({ Text: z.string() }).parse(await response.json());
    const match = /\/verify-email\?token=([A-Za-z0-9_-]+)/.exec(body.Text);
    if (match?.[1]) tokens.push(match[1]);
  }
  return tokens;
}
async function waitTokens(count: number) {
  await expect
    .poll(async () => (await verificationTokens()).length, { timeout: 10000 })
    .toBe(count);
  return verificationTokens();
}
const failure = (text: string) =>
  z
    .object({
      errors: z.array(
        z.object({ code: z.string(), source: z.object({ pointer: z.string() }).optional() }),
      ),
    })
    .parse(JSON.parse(text) as unknown);
it("가입 메일의 링크로 한 번 인증하고 환영 메일을 받으며 같은 토큰 재사용은 422다", async () => {
  const f = await fixture();
  const registered = await f.register();
  expect(registered.status).toBe(201);
  const [token] = await waitTokens(1);
  const verified = await f.post("email-verifications", "email-verifications", { token });
  expect(verified.status).toBe(201);
  await expect
    .poll(async () => (await messages()).some((m) => m.Subject === "가입을 환영합니다"), {
      timeout: 10000,
    })
    .toBe(true);
  const reused = await f.post("email-verifications", "email-verifications", { token });
  expect(reused.status).toBe(422);
  expect(failure(reused.text).errors[0]?.code).toBe("auth.verification_token_invalid");
});
it("재발송은 본문 없는 202이고 최신 메일 토큰만 유효하다", async () => {
  const f = await fixture();
  expect((await f.register()).status).toBe(201);
  const [old] = await waitTokens(1);
  const resent = await f.post("email-verification-requests", "email-verification-requests", {
    email: "registration@example.com",
  });
  expect(resent.status).toBe(202);
  expect(resent.text).toBe("");
  const tokens = await waitTokens(2);
  const latest = tokens.find((t) => t !== old);
  expect(typeof latest === "string").toBe(true);
  expect((await f.post("email-verifications", "email-verifications", { token: old })).status).toBe(
    422,
  );
  expect(
    (await f.post("email-verifications", "email-verifications", { token: latest })).status,
  ).toBe(201);
  const absent = await f.post("email-verification-requests", "email-verification-requests", {
    email: "absent@example.com",
  });
  expect(absent.status).toBe(202);
  expect(absent.text).toBe("");
});
it("동시 같은 이메일 가입은 201 하나와 이메일 pointer를 가진 422 하나다", async () => {
  const f = await fixture();
  const responses = await Promise.all([f.register(), f.register()]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 422]);
  const rejected = responses.find((r) => r.status === 422);
  expect(failure(rejected?.text ?? "").errors[0]).toMatchObject({
    code: "validation.already_taken",
    source: { pointer: "/data/attributes/email" },
  });
});
it("짝 없는 서로게이트 비밀번호도 가입 201이며 저장한 해시가 같은 바이트를 검증한다", async () => {
  const f = await fixture();
  const password = "abcd\ud800xyz"; // betterleaks:allow 사유: 서로게이트 바이트를 확인하는 가짜 비밀번호
  expect((await f.register("surrogate@example.com", password)).status).toBe(201);
  const stored = await f.app
    .get(UnitOfWork)
    .run((tx) => tx.user.findUnique({ where: { email: "surrogate@example.com" } }));
  expect(await verifyPassword(stored?.passwordHash ?? "", password)).toBe(true);
});
