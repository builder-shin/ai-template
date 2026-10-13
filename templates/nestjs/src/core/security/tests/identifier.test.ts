import { createHmac } from "node:crypto";
import { expect, it } from "vitest";
import { normalizeEmail, hashIdentifier } from "../identifier.js";

it("이메일은 앞뒤 공백을 지우고 소문자로 만든다", () => {
  expect(normalizeEmail(" Ada@Example.COM \n")).toBe("ada@example.com");
});
it("식별자는 정규화한 이메일의 HMAC-SHA256 hex다", () => {
  expect(hashIdentifier(" Ada@Example.COM ", "시험용-key")).toBe(
    createHmac("sha256", "시험용-key").update("ada@example.com").digest("hex"),
  );
});
it("다른 비밀키는 다른 식별자 해시를 만든다", () => {
  expect(hashIdentifier("ada@example.com", "첫-key")).not.toBe(
    hashIdentifier("ada@example.com", "둘-key"),
  );
});
