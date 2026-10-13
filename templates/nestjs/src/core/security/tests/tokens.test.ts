import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { newOpaqueToken } from "../tokens.js";
it("기본 토큰은 무작위 32바이트와 SHA-256 해시를 만든다", () => {
  const { token, hash } = newOpaqueToken();
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(Buffer.from(token, "base64url")).toHaveLength(32);
  expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
  expect(newOpaqueToken().token).not.toBe(token);
});
it("요청한 바이트 수로 토큰을 만든다", () => {
  expect(Buffer.from(newOpaqueToken(16).token, "base64url")).toHaveLength(16);
});
