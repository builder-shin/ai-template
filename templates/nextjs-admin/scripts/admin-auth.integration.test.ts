import { afterEach, beforeEach, expect, inject, it, vi } from "vitest";
import { loginAction, logoutAction, changeLocaleAction } from "../src/lib/admin/actions";
import { appSessionCookieName, appOrigin } from "../src/lib/app-config.mjs";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { sealSession, sessionFromTokens, unsealSession } from "../src/lib/session/cookie";
import { memberFixture, partialAdminFixture } from "./test/admin-fixture";
import { createApiClient } from "../src/lib/api/client";
import { startMock } from "./test/mock-server";
import { seedFixture } from "./test/admin-fixture";
import en from "../messages/en.json";
import ko from "../messages/ko.json";

const context = vi.hoisted(() => ({
  locale: "ko",
  jar: new Map<string, { value: string; maxAge?: number }>(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => context.jar.get(name),
    set: (cookie: { name: string; value: string; maxAge?: number }) =>
      context.jar.set(cookie.name, cookie),
  }),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => context.locale }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
beforeEach(() => {
  context.jar.clear();
  context.locale = "ko";
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("APP_URL", appOrigin("dev"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
});
afterEach(() => vi.unstubAllEnvs());
const cookie = appSessionCookieName("development");
function form(account: { email: string; password: string }) {
  const data = new FormData();
  data.set("email", account.email);
  data.set("password", account.password);
  return data;
}

it.each(["ko", "en"] as const)(
  "일반 회원은 %s 안내를 받고 새 세션도 쿠키도 남지 않는다",
  async (locale) => {
    context.locale = locale;
    const { account, owner } = await memberFixture(inject("mockBaseUrl"), locale);
    const before = (await owner.client.GET("/sessions")).data!.data;
    expect(await loginAction({ ok: true }, form(account))).toMatchObject({
      ok: false,
      noAccess: true,
      formError: (locale === "en" ? en : ko).auth.noAccess,
    });
    expect(context.jar.has(cookie)).toBe(false);
    expect(context.jar.has("NEXT_LOCALE")).toBe(false);
    expect((await owner.client.GET("/sessions")).data!.data).toHaveLength(before.length);
  },
);

it("일부 권한 관리자도 로그인하고 계정 언어로 이동한다", async () => {
  const { account } = await partialAdminFixture(inject("mockBaseUrl"), "en");
  await expect(loginAction({ ok: true }, form(account))).rejects.toMatchObject({
    digest: "NEXT_REDIRECT;replace;/en;307;",
  });
  const session = await unsealSession(context.jar.get(cookie)?.value);
  expect(session).not.toBeNull();
  const client = createApiClient({
    baseUrl: `${inject("mockBaseUrl")}/api/v1`,
    locale: "en",
    accessToken: session!.accessToken,
  });
  expect((await client.GET("/me")).data!.meta.permissions).toEqual(["admin:access"]);
  expect(context.jar.get("NEXT_LOCALE")?.value).toBe("en");
});

it("잘못된 비밀번호는 폼 오류이며 쿠키를 쓰지 않는다", async () => {
  const result = await loginAction(
    { ok: true },
    form({ email: "missing@example.com", password: "wrong" }), // betterleaks:allow
  );
  expect(result).toMatchObject({ ok: false, formError: expect.any(String) });
  expect(context.jar.has(cookie)).toBe(false);
});

it("로그아웃은 실제 세션과 쿠키를 끝내고 현재 언어의 로그인 화면으로 간다", async () => {
  const { owner } = await partialAdminFixture(inject("mockBaseUrl"));
  context.locale = "en";
  context.jar.set(cookie, { value: await sealSession(sessionFromTokens(owner.session, owner.id)) });
  await expect(logoutAction()).rejects.toMatchObject({
    digest: "NEXT_REDIRECT;replace;/en/login;307;",
  });
  expect(context.jar.get(cookie)).toMatchObject({ value: "", maxAge: 0 });
  await expect(owner.client.GET("/me")).rejects.toMatchObject({ status: 401 });
});

it("언어 전환은 계정·쿠키·같은 화면을 함께 바꾼다", async () => {
  const { owner } = await partialAdminFixture(inject("mockBaseUrl"));
  context.jar.set(cookie, { value: await sealSession(sessionFromTokens(owner.session, owner.id)) });
  await expect(changeLocaleAction("en", "/?view=all")).rejects.toMatchObject({
    digest: "NEXT_REDIRECT;replace;/en?view=all;307;",
  });
  expect((await owner.client.GET("/me")).data!.data.attributes.locale).toBe("en");
  expect(context.jar.get("NEXT_LOCALE")?.value).toBe("en");
});

it("언어 전환의 429는 Retry-After를 폼 상태로 돌려주고 계정 쿠키를 유지한다", async () => {
  const mock = await startMock({ env: () => ({ RATE_LIMIT_GLOBAL: "1" }) });
  try {
    const owner = await seedFixture(mock.base);
    const original = await sealSession(sessionFromTokens(owner.session, owner.id));
    context.jar.set(cookie, { value: original });
    vi.stubEnv("API_BASE_URL", `${mock.base}/api/v1`);
    expect(await changeLocaleAction("en", "/")).toMatchObject({
      ok: false,
      formError: expect.any(String),
      retryAfter: expect.any(Number),
    });
    expect(context.jar.get(cookie)?.value).toBe(original);
    expect(context.jar.has("NEXT_LOCALE")).toBe(false);
  } finally {
    await mock.stop();
  }
});
