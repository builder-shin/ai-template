import { expect, it } from "vitest";
import { identityFrom } from "../../index.js";
import type { OAuthProvider } from "../../index.js";
it.each([
  [
    "google",
    { sub: "g1", email: "Ada@GMAIL.COM", email_verified: true, name: "Ada" },
    { subject: "g1", email: "Ada@GMAIL.COM", emailVerified: true, name: "Ada" },
  ],
  [
    "google",
    { sub: "g2", email: "ada@example.com", email_verified: true },
    { subject: "g2", email: "ada@example.com", emailVerified: false, name: null },
  ],
  [
    "google",
    { sub: "g3", email: "ada@example.com", email_verified: true, hd: "example.com" },
    { subject: "g3", email: "ada@example.com", emailVerified: true, name: null },
  ],
  [
    "google",
    { sub: "g4", email: "ada@gmail.com", email_verified: false, hd: "gmail.com" },
    { subject: "g4", email: "ada@gmail.com", emailVerified: false, name: null },
  ],
  [
    "google",
    { sub: "g5", email: "ada@gmail.com", email_verified: "true" },
    { subject: "g5", email: "ada@gmail.com", emailVerified: false, name: null },
  ],
  ["google", { sub: "g6" }, { subject: "g6", email: null, emailVerified: false, name: null }],
  [
    "kakao",
    {
      id: 7001,
      kakao_account: {
        email: "ada@example.com",
        is_email_valid: true,
        is_email_verified: true,
        profile: { nickname: "Ada" },
      },
    },
    { subject: "7001", email: "ada@example.com", emailVerified: true, name: "Ada" },
  ],
  [
    "kakao",
    {
      id: "k2",
      kakao_account: { email: "ada@example.com", is_email_valid: true, is_email_verified: false },
    },
    { subject: "k2", email: "ada@example.com", emailVerified: false, name: null },
  ],
  [
    "kakao",
    {
      id: "k3",
      kakao_account: { email: "ada@example.com", is_email_valid: false, is_email_verified: true },
    },
    { subject: "k3", email: "ada@example.com", emailVerified: false, name: null },
  ],
  [
    "kakao",
    { id: "k4", kakao_account: { is_email_valid: true, is_email_verified: true } },
    { subject: "k4", email: null, emailVerified: false, name: null },
  ],
  [
    "naver",
    { response: { id: "n1", email: "ada@example.com", name: "Ada", email_verified: true } },
    { subject: "n1", email: "ada@example.com", emailVerified: false, name: "Ada" },
  ],
  [
    "naver",
    { response: { id: "n2" } },
    { subject: "n2", email: null, emailVerified: false, name: null },
  ],
] as const)("%s 신원 %j의 이메일 검증은 제공자 정책을 따른다", (provider, profile, expected) => {
  expect(identityFrom(provider, profile)).toEqual(expected);
});
it.each(["google", "kakao", "naver"] as const)(
  "%s 신원에 subject가 없으면 연결을 거절한다",
  (provider) => {
    expect(() => identityFrom(provider, {})).toThrow();
  },
);
it.each([[null], [[]], ["profile"]])("객체가 아닌 신원 %j는 연결을 거절한다", (profile) => {
  expect(() => identityFrom("google" satisfies OAuthProvider, profile)).toThrow();
});
