import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { expect, it, vi } from "vitest";
import {
  AuthModule,
  RegistrationService,
  VerificationService,
  AuthMails,
  AuthRepository,
  SessionsService,
  SessionsRepository,
  JwtPrincipalResolver,
} from "../index.js";
import { JsonLogger } from "../../../core/logging/json-logger.js";
import { RedisClients } from "../../../core/redis/clients.js";
import { MailSender } from "../../../core/mail/sender.js";
import { JobQueue } from "../../../core/jobs/queue.js";
import { UnitOfWork } from "../../../core/db/unit-of-work.js";
import { StrictLimiter } from "../../../core/ratelimit/strict.js";
import { SETTINGS } from "../../../core/config/settings.js";
import { createApp } from "../../../core/http/create-app.js";
import { registeredRoutes } from "../../../core/http/routes.js";
import { settings } from "../../../core/http/tests/fixtures.js";
import { fixture } from "./fixtures.js";
import { RolesRepository } from "../../roles/index.js";
import { PasswordBootstrap } from "../../../core/security/passwords.js";
import { parseQuery } from "../../../core/jsonapi/query.js";
it("오프라인 모드는 인증 경로를 등록하고 실제 인프라 서비스 없이 호출을 거절한다", async () => {
  const app = await createApp({ settings }, false);
  const expectedErrors = vi.spyOn(app.get(JsonLogger), "error").mockImplementation(() => {});
  try {
    expect(registeredRoutes(app)).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/api/v1/registrations" },
        { method: "POST", path: "/api/v1/email-verification-requests" },
        { method: "POST", path: "/api/v1/email-verifications" },
        { method: "POST", path: "/api/v1/sessions" },
        { method: "GET", path: "/api/v1/sessions" },
        { method: "DELETE", path: "/api/v1/sessions/current" },
        { method: "DELETE", path: "/api/v1/sessions/:id" },
        { method: "POST", path: "/api/v1/session-revocations" },
      ]),
    );
    expect(() =>
      app.get(RegistrationService).create(
        {
          email: "x@example.com",
          password: "password-123", // betterleaks:allow 사유: 오프라인 DI 시험의 가짜 비밀번호
          name: "이름",
        },
        "ip",
      ),
    ).toThrow("인프라가 없는 앱에서는 인증 작업을 실행할 수 없다");
    expect(() => app.get(VerificationService).request("x@example.com", "ip")).toThrow(
      "인프라가 없는 앱에서는 인증 작업을 실행할 수 없다",
    );
    expect(() => app.get(VerificationService).verify("token")).toThrow(
      "인프라가 없는 앱에서는 인증 작업을 실행할 수 없다",
    );
    const sessions = app.get(SessionsService);
    const principal = { userId: "u", sessionId: "s", permissions: new Set<never>() };
    for (const call of [
      () => sessions.createWithPassword({ email: "x@example.com", password: "p" }, { ip: "ip" }),
      () => sessions.refresh("token"),
      () => sessions.list(principal, parseQuery("", {}), ""),
      () => sessions.revokeCurrent(principal),
      () => sessions.revoke(principal, "s"),
      () => sessions.revokeOthers(principal),
      () => sessions.revokeAll(principal),
    ])
      expect(call).toThrow("인프라가 없는 앱에서는 인증 작업을 실행할 수 없다");
    for (const token of [
      UnitOfWork,
      StrictLimiter,
      JobQueue,
      MailSender,
      AuthMails,
      RedisClients,
      SessionsRepository,
      JwtPrincipalResolver,
      PasswordBootstrap,
    ])
      expect(() => app.get(token)).toThrow();
    expect(expectedErrors).toHaveBeenCalledTimes(9);
  } finally {
    expectedErrors.mockRestore();
    await app.close();
  }
});
@Global()
@Module({})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class FixtureInfrastructure {}
it("인프라 모드는 주입한 저장소와 큐를 실제 Nest 서비스에 연결한다", async () => {
  const f = fixture();
  const app = await Test.createTestingModule({
    imports: [
      AuthModule.register(true),
      {
        module: FixtureInfrastructure,
        providers: [
          { provide: UnitOfWork, useValue: f.unit },
          { provide: StrictLimiter, useValue: f.limiter },
          { provide: SETTINGS, useValue: settings },
        ],
        exports: [UnitOfWork, StrictLimiter, SETTINGS],
      },
    ],
  })
    .overrideProvider(AuthRepository)
    .useValue(f.repository)
    .overrideProvider(RolesRepository)
    .useValue(f.roles)
    .overrideProvider(JobQueue)
    .useValue(f.queue)
    .overrideProvider(MailSender)
    .useValue(f.sender)
    .overrideProvider(RedisClients)
    .useValue({})
    .compile();
  try {
    expect(app.get(RegistrationService)).toBeInstanceOf(RegistrationService);
    expect(app.get(VerificationService)).toBeInstanceOf(VerificationService);
    expect(app.get(AuthMails)).toBeInstanceOf(AuthMails);
    expect(app.get(SessionsService)).toBeInstanceOf(SessionsService);
    expect(app.get(JwtPrincipalResolver)).toBeInstanceOf(JwtPrincipalResolver);
    await app.init();
    await app.get(RegistrationService).create(
      {
        email: "member@example.com",
        password: "password-123", // betterleaks:allow 사유: 주입한 가입 fixture의 가짜 비밀번호
        name: "가입자",
      },
      "192.0.2.3",
    );
    expect(f.state.users[0]?.email).toBe("member@example.com");
    expect(f.jobs).toEqual([
      { name: "auth.send_verification_mail", data: { id: f.state.users[0]?.id } },
    ]);
    expect(f.events).toEqual(["begin", "commit", "enqueue"]);
  } finally {
    await app.close();
  }
});
it("필수 UnitOfWork가 없으면 인증 서비스를 생성할 때 실패한다", async () => {
  await expect(
    Test.createTestingModule({ providers: [RegistrationService] }).compile(),
  ).rejects.toThrow(/UnitOfWork/);
});
