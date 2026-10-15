import { describe, expect, it } from "vitest";
import { e2eEnvironment, e2eOptions } from "../e2e-options.js";

describe("E2E 격리와 명령 옵션", () => {
  const env = {
    DATABASE_URL: "postgresql://app:app@127.0.0.1:25432/app?schema=public", // betterleaks:allow 사유: 로컬 시험 계정
    REDIS_URL: "redis://127.0.0.1:26379/0",
    REALTIME_ALLOWED_ORIGINS: "http://localhost:3001",
    STORAGE_ALLOWED_ORIGINS: "http://localhost:3001",
    SEED_ADMIN_EMAIL: "admin@example.test",
    SEED_ADMIN_PASSWORD: "fixture-admin-password", // betterleaks:allow 사유: 가짜 시드 비밀번호
  };
  it("개발 DB와 Redis 0 대신 app_e2e와 Redis 14만 선택한다", () => {
    const { server, command } = e2eEnvironment("http://localhost:3000", env);
    expect(server.DATABASE_URL).toBe("postgresql://app:app@127.0.0.1:25432/app_e2e?schema=public"); // betterleaks:allow 사유: 로컬 시험 계정
    expect(server.REDIS_URL).toBe("redis://127.0.0.1:26379/14");
    expect(server.PORT).toBe("18000");
    expect(server.RECENT_LOGIN_SECONDS).toBe("10");
    expect(server.REALTIME_ALLOWED_ORIGINS).toBe("http://localhost:3001,http://localhost:3000");
    expect(server.STORAGE_ALLOWED_ORIGINS).toBe("http://localhost:3001,http://localhost:3000");
    expect(command).toMatchObject({
      E2E_API_URL: "http://127.0.0.1:18000",
      E2E_WEB_URL: "http://localhost:3000",
      E2E_MAILPIT_URL: "http://127.0.0.1:28025",
      E2E_OAUTH_URL: "http://127.0.0.1:28080",
      E2E_RECENT_LOGIN_SECONDS: "10",
      E2E_SEED_ADMIN_EMAIL: "admin@example.test",
      E2E_SEED_ADMIN_PASSWORD: env.SEED_ADMIN_PASSWORD,
    });
    expect(env.DATABASE_URL).toContain("/app?");
    expect(env.REDIS_URL).toMatch(/\/0$/);
  });
  it("-- 뒤의 명령 인자를 변형하지 않는다", () => {
    expect(
      e2eOptions(["--web-url", "http://localhost:3001", "--", "node", "-e", "a b", "--web-url"]),
    ).toEqual({ webUrl: "http://localhost:3001", command: ["node", "-e", "a b", "--web-url"] });
    expect(e2eOptions([])).toEqual({ webUrl: "http://localhost:3000", command: [] });
  });
  it("Redis URL의 db 매개변수가 개발 DB를 다시 선택하지 못한다", () => {
    const { server } = e2eEnvironment("http://localhost:3000", {
      ...env,
      REDIS_URL: "redis://127.0.0.1:26379/0?db=0",
    });
    expect(server.REDIS_URL).toBe("redis://127.0.0.1:26379/14");
    expect(server.AITPL_LISTEN_HOST).toBe("127.0.0.1");
  });
  it.each(
    [
      ["--unknown"],
      ["--web-url"],
      ["--web-url", "file:///tmp/a"],
      ["--web-url", "http://u:p@localhost:3000"],
      ["--web-url", "http://localhost:3000?x"],
    ].map((args) => ({ args })),
  )("잘못된 옵션은 서버 시작 전에 거절한다: $args", ({ args }) => {
    expect(() => e2eOptions(args)).toThrow();
  });
});
