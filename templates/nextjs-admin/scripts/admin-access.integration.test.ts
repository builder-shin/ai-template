import { afterEach, beforeEach, expect, inject, it, vi } from "vitest";
import { requireAdmin } from "../src/lib/admin/account";
import { appOrigin, appSessionCookieName } from "../src/lib/app-config.mjs";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { sealSession, sessionFromTokens } from "../src/lib/session/cookie";
import { partialAdminFixture } from "./test/admin-fixture";

const request = vi.hoisted(() => ({ value: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: request.value }) }),
}));
beforeEach(() => {
  request.value = "";
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("APP_URL", appOrigin("dev"));
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
});
afterEach(() => vi.unstubAllEnvs());

it.each(["ko", "en"] as const)(
  "%s의 다음 요청은 실제로 회수된 권한을 다시 확인한다",
  async (locale) => {
    const { owner, seed, roleId } = await partialAdminFixture(inject("mockBaseUrl"), locale);
    request.value = await sealSession(sessionFromTokens(owner.session, owner.id));
    expect((await requireAdmin(locale)).permissions).toEqual(["admin:access"]);
    await seed.client.PATCH("/roles/{id}", {
      params: { path: { id: roleId } },
      body: { data: { type: "roles", id: roleId, attributes: { permissions: [] } } },
    });
    await expect(requireAdmin(locale)).rejects.toMatchObject({
      digest: `NEXT_REDIRECT;replace;${locale === "en" ? "/en" : ""}/forbidden;307;`,
    });
  },
);

it("폐기된 세션은 같은 origin 쿠키 정리 route를 거쳐 로그인으로 간다", async () => {
  const { owner } = await partialAdminFixture(inject("mockBaseUrl"));
  request.value = await sealSession(sessionFromTokens(owner.session, owner.id));
  await owner.client.DELETE("/sessions/current");
  await expect(requireAdmin("ko")).rejects.toMatchObject({
    digest: "NEXT_REDIRECT;replace;/session/clear?returnTo=%2F;307;",
  });
  expect(appSessionCookieName("production")).toBe("__Host-admin-session");
});
