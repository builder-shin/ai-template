import { expect, it } from "vitest";
import {
  registrationCreateDocumentSchema,
  emailVerificationRequestCreateDocumentSchema,
  emailVerificationCreateDocumentSchema,
} from "../index.js";
const registration = (attributes: object) => ({ data: { type: "registrations", attributes } });
const valid = {
  email: "member@example.com",
  password: "password-123", // betterleaks:allow 사유: 스키마 시험의 가짜 비밀번호
  name: "민수",
};
it("가입 스키마는 필수 속성과 선택 locale을 계약대로 받는다", () => {
  expect(registrationCreateDocumentSchema.parse(registration({ ...valid, locale: "en" }))).toEqual(
    registration({ ...valid, locale: "en" }),
  );
  expect(registrationCreateDocumentSchema.parse(registration(valid))).toEqual(registration(valid));
});
it("비밀번호 길이는 코드 포인트로 세고 짝 없는 서로게이트의 바이트를 보존해 받는다", () => {
  for (const password of ["😀".repeat(8), "abcd\ud800xyz"])
    expect(
      registrationCreateDocumentSchema.safeParse(registration({ ...valid, password })).success,
    ).toBe(true);
  expect(
    registrationCreateDocumentSchema.safeParse(registration({ ...valid, password: "😀".repeat(7) }))
      .success,
  ).toBe(false);
});
it.each([
  { name: "" },
  { name: "x".repeat(101) },
  { password: "x".repeat(129) },
  { email: "invalid" },
  { locale: "ja" },
  { name: "\ud800" },
])("잘못된 가입 필드 %j를 거절한다", (change) => {
  expect(
    registrationCreateDocumentSchema.safeParse(registration({ ...valid, ...change })).success,
  ).toBe(false);
});
it("재발송 스키마는 이메일 요청을 받는다", () => {
  const input = {
    data: { type: "email-verification-requests", attributes: { email: "member@example.com" } },
  };
  expect(emailVerificationRequestCreateDocumentSchema.parse(input)).toEqual(input);
});
it("인증 토큰은 빈 문자열과 짝 없는 서로게이트도 도메인 비교로 넘긴다", () => {
  for (const token of ["", "\ud800", "opaque-token"]) {
    const input = { data: { type: "email-verifications", attributes: { token } } };
    expect(emailVerificationCreateDocumentSchema.parse(input)).toEqual(input);
  }
});
