import { beforeAll, beforeEach, afterAll, afterEach, expect, it } from "vitest";
import {
  app,
  db,
  start,
  reset,
  stop,
  api,
  post,
  codes,
  tokens,
  verifiedAccount,
  login,
  verificationToken,
  testDurations,
} from "./helpers.js";
import { UnitOfWork } from "../../src/core/db/unit-of-work.js";
import { advisoryXactLock, lockForUpdate } from "../../src/core/db/locks.js";
import { Pool } from "pg";
import { settings } from "./helpers.js";
import { guardDatabase } from "../../scripts/db-guard.js";
let testStarted = 0;
beforeAll(() => start());
beforeEach(async () => {
  testStarted = performance.now();
  await reset();
});
afterEach((context) => {
  testDurations.push({ name: context.task.name, durationMs: performance.now() - testStarted });
});
afterAll(stop);
it("registers, receives real Mailpit mail, verifies, signs in and loads /me with roles/avatar", async () => {
  const registered = await post("registrations", {
    email: " ALICE@EXAMPLE.COM ",
    password: "correct horse", // betterleaks:allow - public local example or test credential
    name: "Alice",
    locale: "en",
  });
  expect(registered.status).toBe(201);
  expect(
    (registered.body as { data: { attributes: { email: string } } }).data.attributes.email,
  ).toBe("alice@example.com");
  const blocked = await login();
  expect(blocked.status).toBe(403);
  expect(codes(blocked)).toEqual(["auth.email_not_verified"]);
  const token = await verificationToken("alice@example.com");
  expect((await post("email-verifications", { token })).status).toBe(201);
  const signed = await login();
  expect(signed.status).toBe(201);
  const me = await api()
    .get("/api/v1/me?include=roles,avatar")
    .set("Authorization", `Bearer ${tokens(signed).accessToken}`);
  expect(me.status).toBe(200);
  expect(me.body).toMatchObject({
    data: { relationships: { avatar: { data: null } } },
    included: [{ type: "roles", attributes: { name: "member" } }],
    meta: { permissions: ["posts:create"] },
  });
  expect(await db.accountToken.count()).toBe(0);
});
it("keeps resend responses 202 for unknown, unverified and already-verified users", async () => {
  await verifiedAccount();
  for (const email of ["absent@example.com", "alice@example.com"])
    expect((await post("email-verification-requests", { email })).status).toBe(202);
  expect(
    (
      await post("registrations", {
        email: "new@example.com",
        password: "correct horse", // betterleaks:allow - public local example or test credential
        name: "New",
      })
    ).status,
  ).toBe(201);
  expect((await post("email-verification-requests", { email: "new@example.com" })).status).toBe(
    202,
  );
  expect(await db.accountToken.count()).toBe(2);
});
it("persists failed audit separately and successful audit in the login commit", async () => {
  await verifiedAccount();
  const failed = await login("alice@example.com", "wrong horse"); // betterleaks:allow - public local example or test credential
  expect(failed.status).toBe(401);
  expect(codes(failed)).toEqual(["auth.invalid_credentials"]);
  expect(failed.headers["www-authenticate"]).toBe("Bearer");
  const audit = await db.auditLog.findFirstOrThrow({ where: { action: "session.login_failed" } });
  expect(audit.actorId).toBeNull();
  const metadata = audit.metadata as { identifierHash: string };
  expect(metadata.identifierHash).toMatch(/^[a-f0-9]{64}$/);
  expect(audit.metadata).toMatchObject({
    reason: "invalid_credentials",
  });
  expect(JSON.stringify(audit.metadata)).not.toContain("alice@example.com");
  expect((await login()).status).toBe(201);
  expect(await db.auditLog.count({ where: { action: "session.login_succeeded" } })).toBe(1);
});
it("rejects a social-only account and deactivated users without 500", async () => {
  const user = await verifiedAccount();
  await db.user.update({ where: { id: user.id }, data: { passwordHash: null } });
  expect((await login()).status).toBe(401);
  const second = await verifiedAccount("inactive@example.com");
  await db.user.update({ where: { id: second.id }, data: { status: "deactivated" } });
  const inactive = await login("inactive@example.com");
  expect(inactive.status).toBe(403);
  expect(codes(inactive)).toEqual(["auth.account_deactivated"]);
});
it("prevents U+FFFD cross-login and rejects constrained surrogate registration at its pointer", async () => {
  const replacement = "horse\ufffd-secret",
    lone = "horse\ud800-secret";
  expect(
    (
      await post("registrations", {
        email: "unicode@example.com",
        password: replacement,
        name: "Unicode",
      })
    ).status,
  ).toBe(201);
  const token = await verificationToken("unicode@example.com");
  expect((await post("email-verifications", { token })).status).toBe(201);
  const collision = await login("unicode@example.com", lone);
  expect(collision.status).toBe(401);
  expect(codes(collision)).toEqual(["auth.invalid_credentials"]);
  expect((await login("unicode@example.com", replacement)).status).toBe(201);
  const malformed = await post("registrations", {
    email: "lone@example.com",
    password: lone,
    name: "Lone",
  });
  expect(malformed.status).toBe(422);
  expect(malformed.body).toMatchObject({
    errors: [
      { code: "validation.invalid_format", source: { pointer: "/data/attributes/password" } },
    ],
  });
  const invalid = await login("unicode@example.com", "\ud800"); // betterleaks:allow - public local example or test credential
  expect(invalid.status).toBe(401);
});
it("revokes logout immediately and calculates actual permissions on every request", async () => {
  const user = await verifiedAccount();
  const signed = await login(),
    authorization = `Bearer ${tokens(signed).accessToken}`;
  expect((await api().get("/api/v1/permissions").set("Authorization", authorization)).status).toBe(
    403,
  );
  const role = await db.role.findUniqueOrThrow({ where: { name: "admin" } });
  await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  expect((await api().get("/api/v1/permissions").set("Authorization", authorization)).status).toBe(
    200,
  );
  expect(
    (await api().delete("/api/v1/sessions/current").set("Authorization", authorization)).status,
  ).toBe(204);
  const ended = await api().get("/api/v1/me").set("Authorization", authorization);
  expect(ended.status).toBe(401);
  expect(codes(ended)).toEqual(["auth.token_invalid"]);
});
it("rotates sequentially, detects first reuse and persists session revocation", async () => {
  await verifiedAccount();
  const signed = await login(),
    old = tokens(signed).refreshToken;
  const rotated = await post("sessions", { grantType: "refreshToken", refreshToken: old });
  expect(rotated.status).toBe(201);
  expect(tokens(rotated).refreshToken).not.toBe(old);
  const reused = await post("sessions", { grantType: "refreshToken", refreshToken: old });
  expect(reused.status).toBe(401);
  expect(codes(reused)).toEqual(["auth.refresh_token_reused"]);
  expect(reused.headers["www-authenticate"]).toBe("Bearer");
  expect(
    (
      await api()
        .get("/api/v1/me")
        .set("Authorization", `Bearer ${tokens(rotated).accessToken}`)
    ).status,
  ).toBe(401);
});
it("serializes ten refreshes across connections: one winner, one reuser, eight revoked-session losers", async () => {
  await verifiedAccount();
  const signed = await login(),
    old = tokens(signed).refreshToken;
  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      post("sessions", { grantType: "refreshToken", refreshToken: old }),
    ),
  );
  const wins = responses.filter((r) => r.status === 201),
    losers = responses.filter((r) => r.status === 401);
  expect(wins).toHaveLength(1);
  expect(losers).toHaveLength(9);
  expect(losers.flatMap(codes).filter((code) => code === "auth.refresh_token_reused")).toHaveLength(
    1,
  );
  expect(losers.flatMap(codes).filter((code) => code === "auth.token_invalid")).toHaveLength(8);
  for (const response of losers) expect(response.headers["www-authenticate"]).toBe("Bearer");
  expect((await db.loginSession.findFirstOrThrow()).revokedAt).not.toBeNull();
  const winner = wins[0];
  if (!winner) throw new Error("Missing race winner.");
  const fresh = tokens(winner);
  expect(
    (await post("sessions", { grantType: "refreshToken", refreshToken: fresh.refreshToken }))
      .status,
  ).toBe(401);
  expect(
    (await api().get("/api/v1/me").set("Authorization", `Bearer ${fresh.accessToken}`)).status,
  ).toBe(401);
  console.log(
    JSON.stringify({
      refreshRace: responses.map((r) => ({
        status: r.status,
        codes: r.status === 401 ? codes(r) : [],
      })),
    }),
  );
});
it("serializes same-email registration: one 201 and nine 422, with no 500", async () => {
  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      post("registrations", {
        email: "same@example.com",
        password: "correct horse", // betterleaks:allow - test credential
        name: "Same",
      }),
    ),
  );
  expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
  const losers = responses.filter((r) => r.status === 422);
  expect(losers).toHaveLength(9);
  for (const response of losers) expect(codes(response)).toEqual(["validation.already_taken"]);
  expect(await db.user.count()).toBe(1);
});
it("atomically consumes one verification token among ten requests", async () => {
  await post("registrations", {
    email: "once@example.com",
    password: "correct horse", // betterleaks:allow - public local example or test credential
    name: "Once",
  });
  const token = await verificationToken("once@example.com");
  const responses = await Promise.all(
    Array.from({ length: 10 }, () => post("email-verifications", { token })),
  );
  expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
  expect(responses.filter((r) => r.status === 422)).toHaveLength(9);
  expect(await db.accountToken.count()).toBe(0);
});
it("keeps tagged FOR UPDATE and advisory locks on one transaction connection and waits across transactions", async () => {
  const user = await verifiedAccount(),
    pids: number[] = [],
    order: string[] = [];
  let acquired!: () => void;
  const held = new Promise<void>((done) => {
    acquired = done;
  });
  const first = app.get(UnitOfWork).run(async (tx) => {
    const before = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    await lockForUpdate(tx)`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
    await advisoryXactLock(tx, "integration-lock");
    acquired();
    order.push("first-lock");
    await new Promise((done) => setTimeout(done, 75));
    const after = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    expect(before[0]?.pid).toBe(after[0]?.pid);
    if (!before[0]) throw new Error("Missing backend PID.");
    pids.push(before[0].pid);
    order.push("first-end");
  });
  await held;
  const second = app.get(UnitOfWork).run(async (tx) => {
    const before = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    await advisoryXactLock(tx, "integration-lock");
    order.push("second-lock");
    const after = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    expect(before[0]?.pid).toBe(after[0]?.pid);
    if (!before[0]) throw new Error("Missing backend PID.");
    pids.push(before[0].pid);
  });
  await Promise.all([first, second]);
  expect(new Set(pids).size).toBe(2);
  expect(order).toEqual(["first-lock", "first-end", "second-lock"]);
  console.log(JSON.stringify({ lockConnections: pids, order }));
});
it("runs hooks only after actual commit, discards rolled-back hooks and contains hook failure", async () => {
  const hooks: string[] = [];
  await app.get(UnitOfWork).run(async (tx, afterCommit) => {
    const role = await tx.role.create({ data: { name: "committed" } });
    afterCommit(async () => {
      expect(await db.role.findUnique({ where: { id: role.id } })).not.toBeNull();
      hooks.push("committed");
    });
    afterCommit(() => {
      throw new Error("test delivery failure");
    });
    afterCommit(() => {
      hooks.push("continued");
    });
  });
  await expect(
    app.get(UnitOfWork).run(async (tx, afterCommit) => {
      await tx.role.create({ data: { name: "rolled-back" } });
      afterCommit(() => {
        hooks.push("rollback");
      });
      throw new Error("abort");
    }),
  ).rejects.toThrow("abort");
  expect(hooks).toEqual(["committed", "continued"]);
  expect(await db.role.findUnique({ where: { name: "rolled-back" } })).toBeNull();
});
it("refuses a temporary foreign database before migration or truncation", async () => {
  const url = new URL(settings.DATABASE_URL);
  url.pathname = "/postgres";
  const admin = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  let foreign: Pool | undefined;
  try {
    await admin.query('CREATE DATABASE "app_foreign"');
    url.pathname = "/app_foreign";
    foreign = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
    await foreign.query("CREATE TABLE alembic_version (version_num text)");
    await expect(guardDatabase(url.toString())).rejects.toThrow("foreign database");
    await foreign.query('CREATE TABLE "_prisma_migrations" (id text)');
    await expect(guardDatabase(url.toString())).rejects.toThrow("foreign database tables");
    expect(
      (await foreign.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rowCount,
    ).toBe(2);
  } finally {
    await foreign?.end();
    await admin.query('DROP DATABASE IF EXISTS "app_foreign" WITH (FORCE)');
    await admin.end();
  }
});
