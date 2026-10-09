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
import { Children, isValidElement, type ComponentProps } from "react";
import LoginPage from "../src/app/[locale]/login/page";
import { LoginForm } from "../src/components/login-form";
import { NextRequest } from "next/server";
import proxy from "../src/proxy";

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

async function loginPage(returnTo?: string | string[]) {
  const page = await LoginPage({
    searchParams: Promise.resolve(returnTo === undefined ? {} : { returnTo }),
  });
  const login = Children.toArray(page.props.children).find(
    (child) => isValidElement(child) && child.type === LoginForm,
  );
  if (!isValidElement<ComponentProps<typeof LoginForm>>(login))
    throw new Error("로그인 폼이 없다.");
  return login.props;
}

it.each([
  [
    "ko",
    "/posts?filter%5Bstatus%5D=draft&page%5Bnumber%5D=2",
    "/posts?filter%5Bstatus%5D=draft&page%5Bnumber%5D=2",
  ],
  ["en", "/ko/posts?filter%5Bq%5D=hello", "/en/posts?filter%5Bq%5D=hello"],
  ["ko", "https://evil.example/posts", "/"],
  ["ko", "//evil.example/posts", "/"],
  ["en", "/en/posts?sort=title", "/en/posts?sort=title"],
  ["ko", "/login?returnTo=%2Fposts", "/"],
  ["en", "/login", "/en"],
  ["ko", "/en/login?view=all", "/"],
  ["en", "/ko/login#form", "/en"],
  ["ko", "/session/clear?returnTo=%2Fposts", "/"],
  ["en", "/session/clear", "/en"],
  ["ko", "/login/extra?view=all", "/login/extra?view=all"],
  ["en", "/forbidden?view=all", "/en/forbidden?view=all"],
] as const)("로그인 복귀: 계정 언어 %s, 경로 %s", async (locale, returnTo, target) => {
  const { account } = await partialAdminFixture(inject("mockBaseUrl"), locale);
  const props = await loginPage(returnTo);
  await expect(props.loginAction({ ok: true }, form(account))).rejects.toMatchObject({
    digest: `NEXT_REDIRECT;replace;${target};307;`,
  });
  expect(context.jar.get("NEXT_LOCALE")?.value).toBe(locale);
});

it.each(["ko", "en"] as const)("%s 로그인 permalink는 복귀 쿼리를 보존한다", async (locale) => {
  context.locale = locale;
  const returnTo = "/posts?filter%5Bq%5D=hello&page%5Bnumber%5D=2";
  const props = await loginPage(returnTo);
  const permalink = new URL(props.permalink, "http://localhost");
  expect(permalink.pathname).toBe(locale === "ko" ? "/login" : "/en/login");
  expect(permalink.searchParams.get("returnTo")).toBe(returnTo);
  const { account, owner } = await memberFixture(inject("mockBaseUrl"), locale);
  const before = (await owner.client.GET("/sessions")).data!.data.length;
  expect(await props.loginAction({ ok: true }, form(account))).toMatchObject({ noAccess: true });
  expect((await owner.client.GET("/sessions")).data!.data).toHaveLength(before);
  expect(context.jar.size).toBe(0);
  const result = await props.loginAction({ ok: true }, form({ ...account, password: "wrong" })); // betterleaks:allow 사유: 테스트 비밀번호
  expect(result).toMatchObject({ ok: false, formError: expect.any(String) });
  expect(context.jar.size).toBe(0);
});

it.each(
  [
    undefined,
    ["/posts", "/forbidden"],
    "https://evil.example",
    "//evil.example",
    "/login",
    "/login?returnTo=%2Fposts",
    "/en/login?view=all#form",
    "/ko/login",
    "/EN/login/",
    "/session/clear?returnTo=%2Fposts",
    "/session/clear/",
    "/posts/../login",
    "/%6cogin",
    "/%256cogin",
    "/en%2Flogin",
    "/en%252Flogin",
    "/session%2Fclear",
  ].map((returnTo) => ({ returnTo })),
)("로그인 복귀값 $returnTo: 없거나 모호하면 기본 경로 permalink를 쓴다", async ({ returnTo }) =>
  expect((await loginPage(returnTo)).permalink).toBe("/login?returnTo=%2F"),
);

it.each(["ko", "en"] as const)(
  "%s 로그인 Action 직접 호출도 로그인·세션 정리 목적지를 거절한다",
  async (locale) => {
    const { account } = await partialAdminFixture(inject("mockBaseUrl"), locale);
    for (const returnTo of ["/login?next=posts", "/en/login", "/ko/login", "/session/clear?x=1"])
      await expect(loginAction(returnTo, { ok: true }, form(account))).rejects.toMatchObject({
        digest: `NEXT_REDIRECT;replace;${locale === "ko" ? "/" : "/en"};307;`,
      });
  },
);

it("로그아웃과 겹친 로그인 요청의 폐기 쿠키도 다음 로그인을 로그인 화면으로 돌리지 않는다", async () => {
  const { owner } = await partialAdminFixture(inject("mockBaseUrl"));
  const staleCookie = await sealSession({
    ...sessionFromTokens(owner.session, owner.id),
    accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
  });
  context.jar.set(cookie, { value: staleCookie });
  await expect(logoutAction()).rejects.toMatchObject({
    digest: "NEXT_REDIRECT;replace;/login;307;",
  });
  const response = await proxy(
    new NextRequest(`${appOrigin("dev")}/login`, {
      headers: { Cookie: `${cookie}=${staleCookie}; NEXT_LOCALE=ko` },
    }),
  );
  expect(response.status).toBe(303);
  expect(response.cookies.get(cookie)).toMatchObject({ value: "", maxAge: 0 });
  const target = new URL(response.headers.get("location")!);
  expect(target.pathname).toBe("/login");
  expect(target.searchParams.get("returnTo")).toBe("/login");
  const props = await loginPage(target.searchParams.get("returnTo")!);
  const { account } = await partialAdminFixture(inject("mockBaseUrl"));
  await expect(props.loginAction({ ok: true }, form(account))).rejects.toMatchObject({
    digest: "NEXT_REDIRECT;replace;/;307;",
  });
});

it.each(["ko", "en"] as const)(
  "일반 회원은 %s 안내를 받고 새 세션도 쿠키도 남지 않는다",
  async (locale) => {
    context.locale = locale;
    const { account, owner } = await memberFixture(inject("mockBaseUrl"), locale);
    const before = (await owner.client.GET("/sessions")).data!.data;
    expect(await loginAction("/", { ok: true }, form(account))).toMatchObject({
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
  await expect(loginAction("/", { ok: true }, form(account))).rejects.toMatchObject({
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
    "/",
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
