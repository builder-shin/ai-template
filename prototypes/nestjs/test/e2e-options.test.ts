import { expect, it } from "vitest";
import {
  assertE2eTargets,
  e2eEnvironment,
  origin,
  parseOptions,
  READY_TIMEOUT_MS,
} from "../scripts/e2e-options.js";

it("uses the actual pnpm 12.6 forwarding shape including --", () => {
  expect(
    parseOptions(["--web-url", "http://localhost:3101", "--", "node", "-e", "literal ; $()", "--"]),
  ).toEqual({
    webUrl: "http://localhost:3101",
    command: ["node", "-e", "literal ; $()", "--"],
  });
  expect(parseOptions(["--", "node"]).webUrl).toBe("http://localhost:3000");
  expect(READY_TIMEOUT_MS).toBe(60_000);
});
it.each(
  [
    [],
    ["node"],
    ["--"],
    ["--web-url", "--", "node"],
    ["--bad", "x", "--", "node"],
    ["--web-url", "http://localhost", "extra", "--", "node"],
  ].map((args) => ({ args })),
)("rejects invalid runner arguments $args", ({ args }) => {
  expect(() => parseOptions(args)).toThrow();
});
it.each([
  "ftp://localhost",
  "http://user@localhost",
  "http://user:secret@localhost", // betterleaks:allow public local/test credential
  "http://localhost/",
  "http://localhost/a",
  "http://localhost?x",
  "http://localhost#x",
  "http://localhost/?",
  "http://localhost/#",
  "null",
  "https://localhost:443",
  "http://LOCALHOST",
])("rejects nonliteral Origins %s", (url) => {
  expect(() => origin(url)).toThrow();
});
it.each([
  "http://localhost:3101",
  "https://example.com",
  "http://127.0.0.1:3100",
  "http://[::1]:3100",
])("accepts an Origin %s", (url) => {
  expect(origin(url)).toBe(url);
});
it("overrides server targets and child settings while preserving caller cwd and password without output", () => {
  const inherited = {
    INIT_CWD: "/caller",
    DATABASE_URL: "postgresql://app:app@127.0.0.1:25432/app", // betterleaks:allow public local/test credential
    REDIS_URL: "redis://127.0.0.1:26379/0",
    PORT: "8000",
    RATE_LIMIT_STRICT: "1",
    E2E_API_URL: "foreign",
    STORAGE_ALLOWED_ORIGINS: "http://localhost:3000",
    COMPOSE_PROJECT_NAME: "foreign",
    COMPOSE_FILE: "foreign-compose.yaml",
    COMPOSE_ENV_FILES: ".env",
    SEED_ADMIN_PASSWORD: "fixture-admin-password", // betterleaks:allow public local/test credential
  }; // betterleaks:allow fake test credential
  const env = e2eEnvironment("http://localhost:3101", inherited);
  expect(env.cwd).toBe("/caller");
  expect(env.server).toMatchObject({
    PORT: "18000",
    HOST: "127.0.0.1",
    NODE_ENV: "test",
    RATE_LIMIT_GLOBAL: "1000000",
    RATE_LIMIT_STRICT: "1000000",
    RECENT_LOGIN_SECONDS: "10",
    FRONTEND_URL: "http://localhost:3101",
    REALTIME_ALLOWED_ORIGINS: "http://localhost:3101",
    OAUTH_REDIRECT_URIS: "http://localhost:3101/oauth/callback",
    API_URL: "http://127.0.0.1:18000",
    STORAGE_ALLOWED_ORIGINS: "http://localhost:3000,http://localhost:3101",
  });
  expect(new URL(env.server.DATABASE_URL ?? "").pathname).toBe("/app_e2e");
  expect(new URL(env.server.REDIS_URL ?? "").pathname).toBe("/14");
  expect(env.command.E2E_API_URL).toBe("http://127.0.0.1:18000");
  expect(env.server.COMPOSE_PROJECT_NAME).toBeUndefined();
  expect(env.server.COMPOSE_FILE).toBeUndefined();
  expect(env.server.COMPOSE_ENV_FILES).toBeUndefined();
  expect(env.server.COMPOSE_DISABLE_ENV_FILE).toBe("1");
  expect(env.command.E2E_SEED_ADMIN_PASSWORD === inherited.SEED_ADMIN_PASSWORD).toBe(true);
  expect(env.command.E2E_MAILPIT_URL).toBe("http://127.0.0.1:28025");
  expect(env.command.E2E_OAUTH_URL).toBe("http://127.0.0.1:28080");
  expect(env.command.E2E_WEB_URL).toBe("http://localhost:3101");
  expect(e2eEnvironment("http://localhost:3000", {}).cwd).toBe(process.cwd());
  expect(inherited.PORT).toBe("8000");
});
it("refuses foreign hosts, development databases and other Redis DBs before clearing", () => {
  expect(
    () =>
      e2eEnvironment("http://localhost:3000", { DATABASE_URL: "postgresql://app:app@remote/app" }), // betterleaks:allow public local/test credential
  ).toThrow();
  for (const db of ["app", "app_test"])
    expect(() => {
      assertE2eTargets({
        DATABASE_URL: `postgresql://app:app@localhost/${db}`, // betterleaks:allow public local/test credential
        REDIS_URL: "redis://localhost/14",
      });
    }).toThrow();
  for (const db of ["0", "15"])
    expect(() => {
      assertE2eTargets({
        DATABASE_URL: "postgresql://app:app@localhost/app_e2e", // betterleaks:allow public local/test credential
        REDIS_URL: `redis://localhost/${db}`,
      });
    }).toThrow();
});
