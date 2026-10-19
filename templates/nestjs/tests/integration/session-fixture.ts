import "reflect-metadata";
import { afterEach } from "vitest";
import request from "supertest";
import { z } from "zod";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createApp } from "../../src/core/http/create-app.js";
import { UnitOfWork } from "../../src/core/db/unit-of-work.js";
import { RolesRepository } from "../../src/modules/roles/index.js";
import { hashPassword } from "../../src/core/security/passwords.js";
import { getState } from "./state.js";
const apps: NestExpressApplication[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
export const mediaType = "application/vnd.api+json";
export const sessionDocument = (text: string) =>
  z
    .object({
      data: z.object({
        id: z.string(),
        attributes: z.object({
          accessToken: z.string(),
          refreshToken: z.string(),
          createdAt: z.string(),
          lastUsedAt: z.string(),
        }),
      }),
    })
    .parse(JSON.parse(text) as unknown);
export const errorCode = (text: string) =>
  z.object({ errors: z.array(z.object({ code: z.string() })) }).parse(JSON.parse(text) as unknown)
    .errors[0]?.code;
export async function sessionFixture(
  password = "password-123", // betterleaks:allow 사유: CI 세션 시험의 가짜 비밀번호
) {
  const app = await createApp(
    {
      settings: {
        ...getState().settings,
        RATE_LIMIT_GLOBAL: 600,
        RATE_LIMIT_LOGIN_IP: 50,
        RATE_LIMIT_LOGIN_IDENTIFIER: 50,
      },
    },
    true,
  );
  apps.push(app);
  const unit = app.get(UnitOfWork);
  const passwordHash = await hashPassword(password);
  const user = await unit.run(async (tx) => {
    const roles = new RolesRepository();
    await roles.seedRoles(tx);
    const user = await tx.user.create({
      data: {
        email: "sessions@example.com",
        passwordHash,
        name: "세션 회원",
        emailVerifiedAt: new Date(),
      },
    });
    await roles.assign(tx, user.id, ["member"]);
    return user;
  });
  const http = request(app.getHttpServer());
  const post = (attributes: object) =>
    http
      .post("/api/v1/sessions")
      .set("Content-Type", mediaType)
      .send({ data: { type: "sessions", attributes } });
  const login = (candidate = password) =>
    post({ grantType: "password", email: "sessions@example.com", password: candidate });
  return { app, unit, user, http, post, login };
}
