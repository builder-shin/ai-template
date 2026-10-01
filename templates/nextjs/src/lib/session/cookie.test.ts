import "server-only";
import { createHash } from "node:crypto";
import { EncryptJWT, decodeProtectedHeader } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sealSession, unsealSession, sessionCookie, sessionCookieName } from "./cookie";

const secret = "test-session-secret-with-at-least-32-bytes"; // betterleaks:allow 테스트 키
const session = {
  accessToken: "opaque-access-token-without-jwt-content",
  refreshToken: "opaque-refresh-token-without-jwt-content",
  accessTokenExpiresAt: "2030-01-01T00:15:00.000Z",
  refreshTokenExpiresAt: "2030-01-31T00:00:00.000Z",
};
afterEach(() => vi.useRealTimers());

describe("암호화 세션 쿠키", () => {
  it("불투명한 두 토큰과 계약의 만료 시각을 JWE로 함께 보관한다", async () => {
    vi.useFakeTimers({ now: new Date("2030-01-01T00:00:00Z") });
    const first = await sealSession(session, secret);
    const second = await sealSession(session, secret);
    expect(first.split(".")).toHaveLength(5);
    expect(decodeProtectedHeader(first)).toMatchObject({ alg: "dir", enc: "A256GCM" });
    expect(first).not.toContain(session.accessToken);
    expect(first).not.toContain(session.refreshToken);
    expect(first).not.toBe(second);
    expect(await unsealSession(first, secret)).toEqual(session);
  });

  it("다른 키, 변조, 손상, 누락된 쿠키를 거절한다", async () => {
    vi.useFakeTimers({ now: new Date("2030-01-01T00:00:00Z") });
    const sealed = await sealSession(session, secret);
    const segments = sealed.split(".");
    segments[3] = `${segments[3]?.startsWith("x") ? "y" : "x"}${segments[3]?.slice(1)}`;
    expect(await unsealSession(segments.join("."), secret)).toBeNull();
    expect(await unsealSession(sealed, `${secret}-different`)).toBeNull();
    expect(await unsealSession("broken", secret)).toBeNull();
    expect(await unsealSession(undefined, secret)).toBeNull();
  });

  it("access 만료 후에도 읽고 refresh 만료 시각부터 거절한다", async () => {
    vi.useFakeTimers({ now: new Date("2030-01-01T00:00:00Z") });
    const sealed = await sealSession(session, secret);
    vi.setSystemTime(new Date("2030-01-01T00:16:00Z"));
    expect(await unsealSession(sealed, secret)).toEqual(session);
    vi.setSystemTime(new Date(session.refreshTokenExpiresAt));
    expect(await unsealSession(sealed, secret)).toBeNull();
  });

  it("올바른 키라도 세션 필드가 잘못되면 거절한다", async () => {
    const sealed = await new EncryptJWT({ ...session, accessTokenExpiresAt: "invalid" })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setExpirationTime(2000000000)
      .encrypt(createHash("sha256").update(secret).digest());
    expect(await unsealSession(sealed, secret)).toBeNull();
    await expect(sealSession(session, "short")).rejects.toThrow();
  });

  it.each(["development", "production"] as const)(
    "%s의 쿠키 플래그와 refresh 수명을 적용한다",
    async (mode) => {
      vi.useFakeTimers({ now: new Date("2030-01-01T00:00:00Z") });
      const cookie = await sessionCookie(session, secret, mode);
      expect(cookie).toMatchObject({
        name: mode === "production" ? "__Host-session" : "session",
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: mode === "production",
        expires: new Date(session.refreshTokenExpiresAt),
      });
      expect(cookie).not.toHaveProperty("domain");
      expect(sessionCookieName(mode)).toBe(cookie.name);
      expect(await unsealSession(cookie.value, secret)).toEqual(session);
    },
  );
});
