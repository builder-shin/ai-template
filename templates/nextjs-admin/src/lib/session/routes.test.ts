import { expect, it } from "vitest";
import { isProtectedPath } from "./routes";
import { requiresLogin } from "./redirect";

it("로그인 화면 외의 모든 경로와 로케일·디코딩·점 경로를 보호한다", () => {
  expect(isProtectedPath("/login")).toBe(false);
  for (const path of ["/", "/forbidden", "/posts", "/unregistered", "/api/unknown", "/posts/a.b"])
    expect(isProtectedPath(path)).toBe(true);
  for (const path of ["/en/login", "/ko/%6Cogin", "/en/x/../login"])
    expect(requiresLogin(path)).toBe(false);
  for (const path of ["/en/forbidden", "/KO/x/../posts/a.b", "/%E0%A4%A"])
    expect(requiresLogin(path)).toBe(true);
});
