function webOrigin(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    value.includes("?") ||
    value.includes("#") ||
    url.pathname !== "/"
  )
    throw new Error("web URL은 http(s) Origin으로 적는다");
  return url.origin;
}
export function e2eEnvironment(
  webUrl: string,
  env: NodeJS.ProcessEnv,
): { server: Record<string, string>; command: Record<string, string> } {
  const origin = webOrigin(webUrl);
  const server: Record<string, string> = Object.fromEntries(
    Object.entries(env).filter((item): item is [string, string] => item[1] !== undefined),
  );
  const db = new URL(env.DATABASE_URL ?? "");
  const redis = new URL(env.REDIS_URL ?? "");
  db.pathname = "/app_e2e";
  redis.pathname = "/14";
  redis.searchParams.delete("db");
  Object.assign(server, {
    DATABASE_URL: db.href,
    REDIS_URL: redis.href,
    PORT: "18000",
    AITPL_LISTEN_HOST: "127.0.0.1",
    RECENT_LOGIN_SECONDS: "10",
    RATE_LIMIT_GLOBAL: "1000000",
    RATE_LIMIT_LOGIN_IP: "1000000",
    RATE_LIMIT_LOGIN_IDENTIFIER: "1000000",
    RATE_LIMIT_REGISTRATION_IP: "1000000",
    RATE_LIMIT_MAIL_IP: "1000000",
    RATE_LIMIT_MAIL_EMAIL: "1000000",
    RATE_LIMIT_PASSWORD_CHANGE_USER: "1000000",
    API_URL: "http://127.0.0.1:18000",
    FRONTEND_URL: origin,
  });
  for (const key of ["REALTIME_ALLOWED_ORIGINS", "STORAGE_ALLOWED_ORIGINS"])
    server[key] = [...new Set([...(env[key] ?? "").split(",").filter(Boolean), origin])].join(",");
  server.OAUTH_REDIRECT_URIS = [
    ...new Set([
      ...(env.OAUTH_REDIRECT_URIS ?? "").split(",").filter(Boolean),
      `${origin}/oauth/callback`,
    ]),
  ].join(",");
  return {
    server,
    command: {
      E2E_API_URL: "http://127.0.0.1:18000",
      E2E_WEB_URL: origin,
      E2E_MAILPIT_URL: "http://127.0.0.1:28025",
      E2E_OAUTH_URL: "http://127.0.0.1:28080",
      E2E_RECENT_LOGIN_SECONDS: "10",
      E2E_SEED_ADMIN_EMAIL: env.SEED_ADMIN_EMAIL ?? "",
      E2E_SEED_ADMIN_PASSWORD: env.SEED_ADMIN_PASSWORD ?? "",
    },
  };
}
export function e2eOptions(args: readonly string[]): {
  webUrl: string;
  command: readonly string[];
} {
  let webUrl = "http://localhost:3000";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--") return { webUrl, command: args.slice(i + 1) };
    const value = args[i + 1];
    if (args[i] !== "--web-url" || !value)
      throw new Error("사용법: e2e:serve [--web-url URL] [-- 명령…]");
    webUrl = webOrigin(value);
    i++;
  }
  return { webUrl, command: [] };
}
