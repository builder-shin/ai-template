import { describe, expect, it } from "vitest";
import { base } from "./helpers";

describe("실제 HTTP의 인코딩·점이 있는 보호 경로", () => {
  it.each(["GET", "POST"])("%s는 proxy에서 로그인으로 보낸다", async (method) => {
    for (const [path, canonical] of [
      ["/%6d%65", "/me"],
      ["/my%2dposts", "/my-posts"],
      ["/en/%6d%65/security", "/en/me/security"],
      ["/me/a.b", "/me/a.b"],
      ["/en/%6d%65/a.b", "/en/me/a.b"],
    ]) {
      const response = await fetch(`${base}${path}`, {
        method,
        redirect: "manual",
        headers: { Cookie: "NEXT_LOCALE=ko", "Accept-Language": "ko", Origin: base },
      });
      expect(response.status, path).toBe(303);
      const location = new URL(response.headers.get("location")!, base);
      expect(location.pathname).toBe(path!.startsWith("/en") ? "/en/login" : "/login");
      expect(location.searchParams.get("returnTo")).toBe(canonical);
    }
  });
});
