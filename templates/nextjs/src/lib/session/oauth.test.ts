import { createHash } from "node:crypto";
import { decodeProtectedHeader, EncryptJWT } from "jose";
import { afterEach, expect, it, vi } from "vitest";
import { oauthCookie, unsealOAuthAttempt } from "./oauth";

const secret = "test-oauth-secret-with-at-least-32-bytes"; // betterleaks:allow 사유: 테스트 키
const attempt = {
  provider: "google",
  verifier: "v".repeat(43),
  returnTo: "/en/me?tab=profile#avatar",
  locale: "en",
} as const;
afterEach(() => vi.useRealTimers());

it.each(["development", "production"] as const)(
  "%s는 암호화·httpOnly 쿠키에 10분만 시도를 보관한다",
  async (mode) => {
    vi.useFakeTimers({ now: new Date("2030-01-01T00:00:00Z") });
    const cookie = await oauthCookie(attempt, secret, mode);
    expect(cookie).toMatchObject({
      name: mode === "production" ? "__Host-oauth" : "oauth",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: mode === "production",
      maxAge: 600,
    });
    expect(cookie).not.toHaveProperty("domain");
    expect(decodeProtectedHeader(cookie.value)).toMatchObject({ alg: "dir", enc: "A256GCM" });
    expect(cookie.value).not.toContain(attempt.verifier);
    expect(await unsealOAuthAttempt(cookie.value, secret)).toEqual(attempt);
    vi.setSystemTime(new Date("2030-01-01T00:09:59Z"));
    expect(await unsealOAuthAttempt(cookie.value, secret)).toEqual(attempt);
    vi.setSystemTime(new Date("2030-01-01T00:10:00Z"));
    expect(await unsealOAuthAttempt(cookie.value, secret)).toBeNull();
  },
);

it("다른 키·변조·누락·세션 JWE를 거절한다", async () => {
  const cookie = await oauthCookie(attempt, secret);
  expect(await unsealOAuthAttempt(cookie.value, `${secret}-other`)).toBeNull();
  expect(await unsealOAuthAttempt("broken", secret)).toBeNull();
  expect(await unsealOAuthAttempt(undefined, secret)).toBeNull();
  const session = await new EncryptJWT({ ...attempt })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setExpirationTime("10m")
    .encrypt(createHash("sha256").update(secret).digest());
  expect(await unsealOAuthAttempt(session, secret)).toBeNull();
});

it("검증하지 않은 목적지와 잘못된 제공자·verifier를 보관하지 않는다", async () => {
  const safe = await oauthCookie({ ...attempt, returnTo: "//evil.example" }, secret);
  expect((await unsealOAuthAttempt(safe.value, secret))?.returnTo).toBe("/");
  await expect(oauthCookie({ ...attempt, verifier: "short" }, secret)).rejects.toThrow();
  const invalid = await new EncryptJWT({ ...attempt, provider: "other" })
    .setSubject("oauth")
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setExpirationTime("10m")
    .encrypt(createHash("sha256").update(secret).digest());
  expect(await unsealOAuthAttempt(invalid, secret)).toBeNull();
});
