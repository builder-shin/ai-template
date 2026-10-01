import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import proxy, { config } from "../src/proxy";

function route(path: string, headers: HeadersInit = {}, method = "GET") {
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers, method }));
}

describe("로케일 proxy 단위 테스트", () => {
  it("접두사 없는 기본 URL은 내부 ko 경로로 다시 쓴다", async () => {
    expect((await route("/")).headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/ko");
  });
  it("영어 URL은 헤더와 쿠키보다 우선하며 선택을 쿠키에 보관한다", async () => {
    const result = await route("/en", { "Accept-Language": "ko", Cookie: "NEXT_LOCALE=ko" });
    expect(result.headers.get("x-middleware-next")).toBe("1");
    expect(result.headers.get("x-middleware-request-x-next-intl-locale")).toBe("en");
    expect(result.cookies.get("NEXT_LOCALE")?.value).toBe("en");
  });
  it("첫 방문의 Accept-Language 가중치와 지역을 따른다", async () => {
    const result = await route("/", { "Accept-Language": "en-US,en;q=0.9,ko;q=0.5" });
    expect(result.headers.get("location")).toBe("http://localhost:3000/en");
    expect(
      (await route("/", { "Accept-Language": "en;q=0.5,ko-KR;q=1" })).headers.get("location"),
    ).toBeNull();
  });
  it.each([
    ["/", "ko-KR,ko;q=0.9", "ko"],
    ["/en", "en-US,en;q=0.9", "en"],
  ])(
    "첫 방문 %s에서 언어 헤더와 로케일이 일치하면 쿠키를 쓰지 않는다",
    async (path, language, locale) => {
      const result = await route(path!, { "Accept-Language": language! });
      expect(result.headers.get("x-middleware-request-x-next-intl-locale")).toBe(locale);
      expect(result.cookies.get("NEXT_LOCALE")).toBeUndefined();
    },
  );
  it("기존 쿠키가 첫 방문 헤더보다 우선한다", async () => {
    expect(
      (await route("/", { "Accept-Language": "en", Cookie: "NEXT_LOCALE=ko" })).headers.get(
        "location",
      ),
    ).toBeNull();
    expect(
      (await route("/", { "Accept-Language": "ko", Cookie: "NEXT_LOCALE=en" })).headers.get(
        "location",
      ),
    ).toBe("http://localhost:3000/en");
  });
  it("지원하지 않는 언어와 잘못된 쿠키는 기본 로케일로 돌아간다", async () => {
    expect(
      (await route("/", { "Accept-Language": "fr", Cookie: "NEXT_LOCALE=fr" })).headers.get(
        "x-middleware-rewrite",
      ),
    ).toBe("http://localhost:3000/ko");
  });
  it("한국어의 불필요한 접두사를 없앤다", async () => {
    expect((await route("/ko")).headers.get("location")).toBe("http://localhost:3000/");
  });
  it("페이지 POST도 통과하며 API와 정적 자원은 matcher에서 제외한다", async () => {
    expect(
      (await route("/en", {}, "POST")).headers.get("x-middleware-request-x-next-intl-locale"),
    ).toBe("en");
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ["/", "/en", "/en/login"]) expect(matcher.test(path)).toBe(true);
    for (const path of ["/api/health", "/_next/static/app.js", "/icon.svg"])
      expect(matcher.test(path)).toBe(false);
  });
});
