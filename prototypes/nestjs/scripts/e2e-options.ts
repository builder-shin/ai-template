import { loadSettings } from "../src/core/config/settings.js";
import { assertLocalDatabase } from "./db-guard.js";

export const API_URL = "http://127.0.0.1:18000";
export const READY_TIMEOUT_MS = 60_000;
export function origin(value: string): string {
  const url = new URL(value);
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    value !== url.origin
  )
    throw new Error(
      "--web-url requires an http(s) Origin without path, credentials, query or fragment.",
    );
  return url.origin;
}
export function parseOptions(args: readonly string[]) {
  const separator = args.indexOf("--");
  if (separator < 0 || !args[separator + 1])
    throw new Error("Usage: pnpm e2e:serve [--web-url <Origin>] -- <command> [args...]");
  const options = args.slice(0, separator);
  if (options.length !== 0 && (options.length !== 2 || options[0] !== "--web-url"))
    throw new Error("Only --web-url <Origin> is supported before --.");
  return {
    webUrl: origin(options[1] ?? "http://localhost:3000"),
    command: args.slice(separator + 1),
  };
}
export function e2eEnvironment(webUrl: string, inherited: NodeJS.ProcessEnv) {
  origin(webUrl);
  const base = loadSettings(inherited);
  assertLocalDatabase(base.DATABASE_URL);
  assertLocalDatabase(base.REDIS_URL);
  const database = new URL(base.DATABASE_URL),
    redis = new URL(base.REDIS_URL);
  const cleanServerEnvironment = Object.fromEntries(
    Object.entries(inherited).filter(([key]) => !key.startsWith("COMPOSE_")),
  );
  database.pathname = "/app_e2e";
  redis.pathname = "/14";
  const env: NodeJS.ProcessEnv = {
    ...cleanServerEnvironment,
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "18000",
    DATABASE_URL: database.href,
    REDIS_URL: redis.href,
    RATE_LIMIT_GLOBAL: "1000000",
    RATE_LIMIT_STRICT: "1000000",
    RECENT_LOGIN_SECONDS: "10",
    FRONTEND_URL: webUrl,
    REALTIME_ALLOWED_ORIGINS: webUrl,
    STORAGE_ALLOWED_ORIGINS: [
      ...new Set([...base.STORAGE_ALLOWED_ORIGINS.split(","), webUrl]),
    ].join(","),
    OAUTH_REDIRECT_URIS: `${webUrl}/oauth/callback`,
    API_URL,
    COMPOSE_DISABLE_ENV_FILE: "1",
  };
  assertE2eTargets(env);
  return {
    server: env,
    command: {
      ...inherited,
      E2E_API_URL: API_URL,
      E2E_WEB_URL: webUrl,
      E2E_MAILPIT_URL: "http://127.0.0.1:28025",
      E2E_OAUTH_URL: "http://127.0.0.1:28080",
      E2E_RECENT_LOGIN_SECONDS: "10",
      E2E_SEED_ADMIN_EMAIL: base.SEED_ADMIN_EMAIL,
      E2E_SEED_ADMIN_PASSWORD: base.SEED_ADMIN_PASSWORD,
    },
    cwd: inherited.INIT_CWD ?? process.cwd(),
  };
}
export function assertE2eTargets(env: NodeJS.ProcessEnv): void {
  if (
    new URL(env.DATABASE_URL ?? "").pathname !== "/app_e2e" ||
    new URL(env.REDIS_URL ?? "").pathname !== "/14"
  )
    throw new Error("E2E requires app_e2e and Valkey DB 14.");
  assertLocalDatabase(env.DATABASE_URL ?? "");
  assertLocalDatabase(env.REDIS_URL ?? "");
}
