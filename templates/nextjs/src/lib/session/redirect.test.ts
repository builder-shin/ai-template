import { afterEach, expect, it, vi } from "vitest";
import { loginDestination } from "./redirect";

it.each(["ko", "en"] as const)("(%s) 계정의 목적지에서 반복한 로케일을 모두 제거한다", (locale) => {
  const prefix = locale === "en" ? "/en" : "";
  for (const path of ["/en/ko/posts?q=one#two", "/KO/en/ko/posts?q=one#two"])
    expect(loginDestination(path, locale)).toBe(`${prefix}/posts?q=one#two`);
  expect(loginDestination("/en/ko?tab=one#two", locale)).toBe(
    locale === "en" ? "/en?tab=one#two" : "/?tab=one#two",
  );
});

afterEach(() => {
  vi.doUnmock("./routes");
  vi.resetModules();
});

it("앱의 보호 규칙에는 디코딩·로케일·점 구간을 정리한 경로를 전달한다", async () => {
  vi.doMock("./routes", () => ({
    isProtectedPath: (path: string) => path === "/reports" || path.startsWith("/reports/"),
  }));
  const { requiresLogin } = await import("./redirect");
  for (const path of ["/reports", "/en/%72eports/a.b", "/KO/x/../reports"])
    expect(requiresLogin(path)).toBe(true);
  for (const path of ["/me", "/reports-public", "/en/login"])
    expect(requiresLogin(path)).toBe(false);
  expect(requiresLogin("/%E0%A4%A")).toBe(true);
});
