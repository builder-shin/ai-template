import { describe, expect, it } from "vitest";
import { extractToken } from "../src/side-channels.ts";
import { resolveTarget } from "../src/targets.ts";

describe("resolveTarget", () => {
  it("대상 이름과 주소를 읽고 끝의 슬래시를 뗀다", () => {
    const target = resolveTarget({
      CONFORMANCE_TARGET: "fastapi",
      CONFORMANCE_BASE_URL: "http://localhost:8000/",
    });
    expect(target).toEqual({ name: "fastapi", baseUrl: "http://localhost:8000" });
  });

  it("모르는 대상이면 허용 목록과 함께 알린다", () => {
    expect(() =>
      resolveTarget({ CONFORMANCE_TARGET: "django", CONFORMANCE_BASE_URL: "http://x" }),
    ).toThrow("CONFORMANCE_TARGET은 fastapi, nestjs, mock 중 하나여야 한다(현재: django).");
  });

  it("주소가 없으면 예시와 함께 알린다", () => {
    expect(() => resolveTarget({ CONFORMANCE_TARGET: "mock" })).toThrow(/CONFORMANCE_BASE_URL/);
  });
});

describe("extractToken", () => {
  it("메일 본문 링크에서 token을 꺼낸다", () => {
    const mail = {
      to: "a@example.com",
      subject: "이메일 인증",
      text: "아래 링크를 누르세요\nhttp://localhost:3000/verify?token=abc.DEF-123_x\n", // betterleaks:allow 테스트용 가짜 토큰
    };
    expect(extractToken(mail)).toBe("abc.DEF-123_x");
  });

  it("token이 없으면 제목과 함께 알린다", () => {
    expect(() => extractToken({ to: "a", subject: "환영", text: "반가워요" })).toThrow(/환영/);
  });
});
