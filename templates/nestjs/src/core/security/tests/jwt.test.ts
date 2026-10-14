import { expect, it } from "vitest";
import { SignJWT, decodeJwt } from "jose";
import { signAccessToken, verifyAccessToken } from "../jwt.js";
const secret = "test-only-secret-with-enough-length"; // betterleaks:allow 사유: JWT 단위 시험의 가짜 서명 키
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 13, 0, 0, seconds));
it("발급 토큰은 HS256의 사용자·세션·발급 시각과 15분 만료를 담는다", async () => {
  const token = await signAccessToken({ userId: "u", sessionId: "s" }, secret, at(0));
  expect(
    JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString()) as unknown,
  ).toMatchObject({ alg: "HS256" });
  expect(decodeJwt(token)).toEqual({ sub: "u", sid: "s", iat: 1791849600, exp: 1791850500 });
  await expect(verifyAccessToken(token, secret, at(0))).resolves.toEqual({
    userId: "u",
    sessionId: "s",
    issuedAt: 1791849600,
    expiresAt: 1791850500,
  });
});
it.each([5, 30])("iat가 %i초 미래면 통과한다", async (skew) => {
  const token = await signAccessToken({ userId: "u", sessionId: "s" }, secret, at(skew));
  await expect(verifyAccessToken(token, secret, at(0))).resolves.toMatchObject({
    userId: "u",
    sessionId: "s",
  });
});
it.each([31, 3600])("iat가 %i초 미래면 401 token_invalid다", async (skew) => {
  const token = await signAccessToken({ userId: "u", sessionId: "s" }, secret, at(skew));
  await expect(verifyAccessToken(token, secret, at(0))).rejects.toMatchObject({
    init: { status: 401, code: "auth.token_invalid", headers: { "WWW-Authenticate": "Bearer" } },
  });
});
it("exp 뒤 29초까지 통과하고 30초부터 만료다", async () => {
  const token = await signAccessToken({ userId: "u", sessionId: "s" }, secret, at(0));
  await expect(verifyAccessToken(token, secret, at(929))).resolves.toBeDefined();
  for (const seconds of [930, 931])
    await expect(verifyAccessToken(token, secret, at(seconds))).rejects.toMatchObject({
      init: { status: 401, code: "auth.token_expired", headers: { "WWW-Authenticate": "Bearer" } },
    });
});
it("과거 iat와 먼 미래 exp는 수명 상한 없이 통과한다", async () => {
  const token = await new SignJWT({ sid: "s" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("u")
    .setIssuedAt(1)
    .setExpirationTime(2000000000)
    .sign(new TextEncoder().encode(secret));
  await expect(verifyAccessToken(token, secret, at(0))).resolves.toMatchObject({
    issuedAt: 1,
    expiresAt: 2000000000,
  });
});
it.each([
  { sid: "s", iat: 1791849600, exp: 1791850500 },
  { sub: "u", iat: 1791849600, exp: 1791850500 },
  { sub: "u", sid: "s", exp: 1791850500 },
  { sub: "u", sid: "s", iat: 1791849600 },
  { sub: "u", sid: 3, iat: 1791849600, exp: 1791850500 },
])("서명됐어도 필수 claim이 없거나 틀리면 거절한다: %j", async (claims) => {
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(secret));
  await expect(verifyAccessToken(token, secret, at(0))).rejects.toMatchObject({
    init: { status: 401, code: "auth.token_invalid" },
  });
});
it("다른 키·허용하지 않은 알고리즘·깨진 토큰은 token_invalid다", async () => {
  const valid = await signAccessToken({ userId: "u", sessionId: "s" }, secret, at(0));
  const other = await new SignJWT({ sub: "u", sid: "s", iat: 1791849600, exp: 1791850500 })
    .setProtectedHeader({ alg: "HS384" })
    .sign(new TextEncoder().encode(secret));
  for (const [token, key] of [
    [valid, "wrong-key"],
    [other, secret],
    ["broken", secret],
  ] as const)
    await expect(verifyAccessToken(token, key, at(0))).rejects.toMatchObject({
      init: { status: 401, code: "auth.token_invalid" },
    });
});
