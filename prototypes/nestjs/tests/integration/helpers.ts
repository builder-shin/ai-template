import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { Response } from "supertest";
import { createApp } from "../../src/main.js";
import { loadSettings } from "../../src/core/config/settings.js";
import { PrismaService } from "../../src/core/db/prisma.service.js";
import { UnitOfWork } from "../../src/core/db/unit-of-work.js";
import { UsersService } from "../../src/modules/users/index.js";
import { RolesService } from "../../src/modules/roles/index.js";
import { SessionWithTokensDocument } from "../../src/modules/auth/schemas.js";
import { assertTestDatabase, guardDatabase } from "../../scripts/db-guard.js";
import { valkey } from "../../scripts/valkey.js";
export const settings = loadSettings(process.env);
export const truncations: number[] = [],
  testDurations: { name: string; durationMs: number }[] = [];
export let app: NestExpressApplication, db: PrismaService;
export async function start(): Promise<void> {
  assertTestDatabase(settings.DATABASE_URL, settings.REDIS_URL);
  await guardDatabase(settings.DATABASE_URL);
  app = await createApp();
  app.useLogger(false);
  await app.init();
  db = app.get(PrismaService);
}
export async function reset(): Promise<void> {
  await guardDatabase(settings.DATABASE_URL);
  const start = performance.now();
  await db.$executeRaw`TRUNCATE audit_logs, account_tokens, refresh_tokens, sessions, user_roles, roles, users RESTART IDENTITY CASCADE`;
  truncations.push(performance.now() - start);
  await valkey(settings.REDIS_URL, "FLUSHDB");
  const cleared = await fetch(`${settings.MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
  if (!cleared.ok) throw new Error("Mailpit reset failed.");
  await app.get(UnitOfWork).run((tx) => app.get(RolesService).seed(tx));
}
export async function stop(): Promise<void> {
  await app.close();
  console.log(
    JSON.stringify({
      testCount: testDurations.length,
      tests: testDurations,
      truncateMeanMs: truncations.reduce((a, b) => a + b, 0) / truncations.length,
      truncateMs: truncations,
    }),
  );
  const directory = resolve(".cache/integration");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, "measurements.json"),
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        testCount: testDurations.length,
        tests: testDurations,
        truncateCount: truncations.length,
        truncateMeanMs: truncations.reduce((a, b) => a + b, 0) / truncations.length,
        truncateMs: truncations,
      },
      null,
      2,
    ),
  );
}
export function api() {
  return request(app.getHttpServer());
}
export function post(type: string, attributes: object) {
  return api()
    .post(`/api/v1/${type}`)
    .set("Content-Type", "application/vnd.api+json")
    .send({ data: { type, attributes } });
}
export function codes(response: Response): string[] {
  return (response.body as { errors: { code: string }[] }).errors.map((e) => e.code);
}
export function tokens(response: Response) {
  return SessionWithTokensDocument.parse(response.body).data.attributes;
}
export async function verifiedAccount(
  email = "alice@example.com",
  password = "correct horse", // betterleaks:allow - public local example or test credential
  admin = false,
) {
  const user = await app.get(UnitOfWork).run(async (tx) => {
    const user = await app
      .get(UsersService)
      .create(tx, { email, password, name: "Alice", locale: "en", verified: true });
    if (admin) await app.get(RolesService).assign(tx, user.id, ["admin"]);
    return user;
  });
  return user;
}
export function login(
  email = "alice@example.com",
  password = "correct horse", // betterleaks:allow - test credential
) {
  return post("sessions", { grantType: "password", email, password });
}
export async function verificationToken(email: string): Promise<string> {
  for (let n = 0; n < 100; n++) {
    const result = await fetch(`${settings.MAILPIT_URL}/api/v1/messages`);
    const data = (await result.json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const found = data.messages.find((m) => m.To.some((to) => to.Address === email));
    if (found) {
      const message = (await (
        await fetch(`${settings.MAILPIT_URL}/api/v1/message/${found.ID}`)
      ).json()) as { Text: string };
      const match = /token=([A-Za-z0-9_-]{43})/.exec(message.Text);
      if (match?.[1]) return match[1];
    }
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error("No verification mail received.");
}
