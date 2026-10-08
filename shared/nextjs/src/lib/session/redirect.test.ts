import { afterEach, expect, it, vi } from "vitest";

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
