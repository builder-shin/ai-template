import { expect, it } from "vitest";
import { hash, verify, argon2id } from "argon2";
import { SignJWT } from "jose";
import { surrogatePassBytes } from "../src/core/security/encoding.js";
import { hashPassword, verifyPassword, ARGON2_OPTIONS } from "../src/core/security/passwords.js";
import { digest, newToken } from "../src/core/security/tokens.js";
import { identifierHash } from "../src/core/security/identifier.js";
import { signAccessToken, verifyAccessToken } from "../src/core/security/jwt.js";
import { safeInt64 } from "../src/core/db/errors.js";
const secret = "s".repeat(32),
  user = "01920000-0000-7000-8000-000000000001",
  session = "01920000-0000-7000-8000-000000000002";
it.each([
  ["a\ud800", "61eda080"],
  ["a\ufffd", "61efbfbd"],
  ["\udc00", "edb080"],
  ["horse\ud800", "686f727365eda080"],
  ["😀", "f09f9880"],
  ["한글", "ed959ceab880"],
])("matches Python surrogatepass bytes for %j", (input, hex) => {
  expect(Buffer.from(surrogatePassBytes(input)).toString("hex")).toBe(hex);
});
it("measures installed Argon2 string conversion and fixes both collision directions with bytes", async () => {
  const raw = await hash("a\ud800b", { ...ARGON2_OPTIONS, type: argon2id });
  expect(await verify(raw, "a\ufffdb")).toBe(true);
  const lone = await hashPassword("a\ud800b"),
    replacement = await hashPassword("a\ufffdb");
  expect(lone.split("$")[1]).toBe("argon2id");
  expect(lone.split("$")[2]).toBe("v=19");
  const parameters: Record<string, string> = {};
  for (const pair of (lone.split("$")[3] ?? "").split(",")) {
    const [key, value] = pair.split("=");
    if (key && value) parameters[key] = value;
  }
  expect(parameters).toEqual({ m: "65536", t: "3", p: "4" });
  expect(await verifyPassword("a\ud800b", lone)).toBe(true);
  expect(await verifyPassword("a\ufffdb", lone)).toBe(false);
  expect(await verifyPassword("a\ud800b", replacement)).toBe(false);
  expect(await verifyPassword("a\ufffdb", replacement)).toBe(true);
  expect(await verifyPassword("\ud800", null)).toBe(false);
  expect(await verifyPassword("\ud800", await hashPassword("correct horse"))).toBe(false);
  const compatible = await hash("correct horse 한글", ARGON2_OPTIONS);
  expect(await verifyPassword("correct horse 한글", compatible)).toBe(true);
});
it("uses surrogatepass for digests and normalized keyed identifiers", () => {
  expect(digest("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  expect(digest("a\ud800b")).not.toBe(digest("a\ufffdb"));
  expect(identifierHash(" Alice@Example.com ", secret)).toBe(
    identifierHash("alice@example.com", secret),
  );
  expect(identifierHash("alice@example.com", secret)).not.toBe(
    identifierHash("alice@example.com", "x".repeat(32)),
  );
  expect(newToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(newToken()).not.toBe(newToken());
});
it("requires HS256, UUID sub/sid, iat/exp and distinguishes expired tokens", async () => {
  const now = new Date(),
    issued = await signAccessToken(secret, user, session, now);
  expect(await verifyAccessToken(secret, issued.token)).toEqual({
    userId: user,
    sessionId: session,
  });
  expect(issued.expiresAt.getTime()).toBe((Math.floor(now.getTime() / 1000) + 900) * 1000);
  await expect(verifyAccessToken("x".repeat(32), issued.token)).rejects.toMatchObject({
    status: 401,
    code: "auth.token_invalid",
  });
  const expired = await signAccessToken(secret, user, session, new Date(Date.now() - 1000000));
  await expect(verifyAccessToken(secret, expired.token)).rejects.toMatchObject({
    code: "auth.token_expired",
  });
  for (const claims of [
    { sub: user },
    { sub: "bad", sid: session },
    { sub: user, sid: session, exp: 4102444800 },
  ]) {
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(secret));
    await expect(verifyAccessToken(secret, token)).rejects.toMatchObject({
      code: "auth.token_invalid",
    });
  }
});
it("converts stored int64 only when JSON number precision is safe", () => {
  expect(safeInt64(9007199254740991n)).toBe(9007199254740991);
  expect(() => safeInt64(9007199254740992n)).toThrow(RangeError);
});

it("preserves controlled future-iat boundaries and valid old-iat/future-exp tokens", async () => {
  const currentDate = new Date("2026-10-12T00:00:00Z"),
    now = Math.floor(currentDate.getTime() / 1000);
  for (const offset of [5, 30, 31, 3600, -10000]) {
    const token = await new SignJWT({ sid: session })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user)
      .setIssuedAt(now + offset)
      .setExpirationTime(now + 7200)
      .sign(new TextEncoder().encode(secret));
    if (offset > 30)
      await expect(verifyAccessToken(secret, token, currentDate)).rejects.toMatchObject({
        status: 401,
        code: "auth.token_invalid",
      });
    else
      expect(await verifyAccessToken(secret, token, currentDate)).toEqual({
        userId: user,
        sessionId: session,
      });
  }
  for (const elapsed of [29, 31]) {
    const token = await new SignJWT({ sid: session })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user)
      .setIssuedAt(now - 900)
      .setExpirationTime(now - elapsed)
      .sign(new TextEncoder().encode(secret));
    if (elapsed === 29)
      expect(await verifyAccessToken(secret, token, currentDate)).toEqual({
        userId: user,
        sessionId: session,
      });
    else
      await expect(verifyAccessToken(secret, token, currentDate)).rejects.toMatchObject({
        code: "auth.token_expired",
      });
  }
});
