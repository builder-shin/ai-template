import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterEach, expect } from "vitest";
import request from "supertest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createApp } from "../../src/core/http/create-app.js";
import { UnitOfWork } from "../../src/core/db/unit-of-work.js";
import { RolesRepository } from "../../src/modules/roles/index.js";
import { hashPassword } from "../../src/core/security/passwords.js";
import { getState } from "./state.js";
import { sessionDocument, mediaType } from "./session-fixture.js";
const apps: NestExpressApplication[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
export async function meFixture(role: "member" | "admin" = "member") {
  const settings = {
    ...getState().settings,
    RECENT_LOGIN_SECONDS: 2,
    RATE_LIMIT_LOGIN_IP: 50,
    RATE_LIMIT_LOGIN_IDENTIFIER: 50,
  };
  const app = await createApp({ settings }, true);
  apps.push(app);
  const unit = app.get(UnitOfWork);
  const password = "me-fixture-password"; // betterleaks:allow 사유: CI의 가짜 비밀번호다
  const passwordHash = await hashPassword(password);
  const roles = new RolesRepository();
  await unit.run((tx) => roles.seedRoles(tx));
  const http = request(app.getHttpServer());
  async function addUser(assignedRole: "member" | "admin") {
    const email = `me-${randomUUID()}@example.test`;
    const user = await unit.run(async (tx) => {
      const user = await tx.user.create({
        data: { email, name: "내 정보 회원", passwordHash, emailVerifiedAt: new Date() },
      });
      await roles.assign(tx, user.id, [assignedRole]);
      return user;
    });
    const login = () =>
      http
        .post("/api/v1/sessions")
        .set("Content-Type", mediaType)
        .send({
          data: { type: "sessions", attributes: { grantType: "password", email, password } },
        });
    const response = await login();
    expect(response.status).toBe(201);
    return { user, login, session: sessionDocument(response.text).data };
  }
  return { app, unit, http, settings, addUser, ...(await addUser(role)) };
}
