import { describe, expect, it } from "vitest";
import { extractToken, matchesMail, type ReceivedMail } from "../src/side-channels.ts";
import { resolveAdmin, resolveMailbox, resolveTarget } from "../src/targets.ts";

function mail(overrides: Partial<ReceivedMail>): ReceivedMail {
  return {
    id: "m1",
    to: "a@example.com",
    subject: "이메일 인증",
    text: "",
    receivedAt: "2026-09-27T05:00:00.000Z",
    ...overrides,
  };
}

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

describe("resolveAdmin", () => {
  it("시드된 관리자의 자격 증명을 읽는다", () => {
    const env = { CONFORMANCE_ADMIN_EMAIL: "admin@example.com", CONFORMANCE_ADMIN_PASSWORD: "pw" };
    expect(resolveAdmin(env)).toEqual({ email: "admin@example.com", password: "pw" });
  });

  it("없으면 넣을 변수를 알린다", () => {
    expect(() => resolveAdmin({ CONFORMANCE_ADMIN_EMAIL: "admin@example.com" })).toThrow(
      /CONFORMANCE_ADMIN_PASSWORD/,
    );
  });
});

describe("resolveMailbox", () => {
  it("Mailpit 주소가 없으면 예시와 함께 알린다", () => {
    expect(() => resolveMailbox({})).toThrow(/CONFORMANCE_MAILPIT_URL/);
    expect(() => resolveMailbox({ CONFORMANCE_TARGET: "fastapi" })).toThrow(
      /CONFORMANCE_MAILPIT_URL/,
    );
  });

  it("목 대상은 Mailpit 없이 대상 주소의 테스트 통로를 쓴다", () => {
    const env = { CONFORMANCE_TARGET: "mock", CONFORMANCE_BASE_URL: "http://localhost:4010" };
    expect(() => resolveMailbox(env)).not.toThrow();
    expect(() => resolveMailbox({ CONFORMANCE_TARGET: "mock" })).toThrow(/CONFORMANCE_BASE_URL/);
  });
});

describe("matchesMail", () => {
  const first = mail({ text: "/verify-email?token=a" });

  it("after와 같거나 앞선 메일은 맞지 않는다", () => {
    expect(matchesMail(first, { after: first })).toBe(false);
    const earlier = mail({ id: "m0", receivedAt: "2026-09-27T04:59:59.000Z" });
    expect(matchesMail(earlier, { after: first })).toBe(false);
    const later = mail({ id: "m2", receivedAt: "2026-09-27T05:00:01.000Z" });
    expect(matchesMail(later, { after: first })).toBe(true);
  });

  it("linkPath는 본문의 토큰 링크 경로를 본다", () => {
    expect(matchesMail(first, { linkPath: "/verify-email" })).toBe(true);
    expect(matchesMail(first, { linkPath: "/reset-password" })).toBe(false);
  });
});

describe("extractToken", () => {
  it("메일 본문 링크에서 token을 꺼낸다", () => {
    const text = "아래 링크를 누르세요\nhttp://localhost:3000/verify?token=abc.DEF-123_x\n"; // betterleaks:allow 테스트용 가짜 토큰
    expect(extractToken(mail({ text }))).toBe("abc.DEF-123_x");
  });

  it("token이 없으면 제목과 함께 알린다", () => {
    expect(() => extractToken(mail({ subject: "환영", text: "반가워요" }))).toThrow(/환영/);
  });
});
