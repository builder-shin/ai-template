import { beforeEach, afterEach, expect, inject, it, vi } from "vitest";
import { ResourcePage } from "../src/components/resource/page";
import { postsFixture } from "./test/resource-fixture";
import { seedFixture, memberFixture, partialAdminFixture } from "./test/admin-fixture";
import { createResourceData } from "../src/lib/resources/data";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { appOrigin, appSessionCookieName } from "../src/lib/app-config.mjs";
import { sealSession, sessionFromTokens } from "../src/lib/session/cookie";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import ko from "../messages/ko.json";
import shared from "../messages/shared/ko.json";
import Home from "../src/app/[locale]/(admin)/page";
const messages = {
  ...shared,
  ...ko,
  resources: {
    posts: {
      title: "글",
      fields: {
        title: "제목",
        body: "본문",
        author: "작성자",
        status: "상태",
        q: "검색",
        createdAt: "작성 시각",
        publishedAt: "발행 시각",
        coverImage: "파일",
      },
      enums: { status: { draft: "초안", published: "발행" } },
    },
  },
};
const translate = createTranslator({ locale: "ko", messages });
const context = vi.hoisted(() => ({ locale: "ko", jar: new Map<string, { value: string }>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => context.jar.get(name) }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => context.locale,
  getTranslations: async () => translate,
}));
vi.mock("../src/lib/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock("../src/resources/index", async () => ({
  resources: [(await import("./test/resource-fixture")).postsFixture],
}));
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
async function session(owner: { session: Parameters<typeof sessionFromTokens>[0]; id: string }) {
  context.jar.set(appSessionCookieName("development"), {
    value: await sealSession(sessionFromTokens(owner.session, owner.id)),
  });
}
it.each(["list", "detail", "create", "edit"] as const)(
  "미등록 경로는 API 호출 전에 404다: %s",
  async (screen) => {
    await expect(ResourcePage({ registry: [], type: "unknown", screen })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  },
);
it("없는 화면도 404다", async () => {
  const { create: _create, ...readonly } = postsFixture;
  await expect(
    ResourcePage({ registry: [readonly], type: "posts", screen: "create" }),
  ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
});
it("리소스 권한 없는 관리자는 forbidden으로 간다", async () => {
  const { owner } = await partialAdminFixture(inject("mockBaseUrl"));
  await session(owner);
  await expect(
    ResourcePage({ registry: [postsFixture], type: "posts", screen: "list" }),
  ).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/forbidden;307;" });
});
it("홈은 볼 수 있는 첫 리소스로, 영문은 접두사를 유지한다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  await session(seed);
  context.locale = "en";
  await expect(Home()).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/en/posts;307;" });
});
it("실제 목 목록을 서버에서 읽고 관계·필터·페이지를 HTML로 그린다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  await session(seed);
  const member = await memberFixture(inject("mockBaseUrl"));
  await createResourceData(member.owner.client).create(postsFixture, {
    title: member.account.email,
    body: "본문",
    status: "draft",
  });
  const resource = {
    ...postsFixture,
    fields: {
      status: { kind: "enum" as const, values: ["draft", "published"] },
      author: { relation: { type: "users", label: "name", search: true } },
    },
  };
  const result = await ResourcePage({
    registry: [resource],
    type: "posts",
    screen: "list",
    searchParams: { "filter[q]": member.account.email },
  });
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="ko" messages={messages}>
      {result}
    </NextIntlClientProvider>,
  );
  expect(html).toContain(member.account.email);
  expect(html).toContain("관리 테스트");
  expect(html).toContain("초안");
  expect(html).toContain(`/users/${member.userId}`);
  expect(html).toContain('aria-label="페이지"');
});
it("작성자 목록 권한이 없어도 글 목록은 표시하고 필터에 안내한다", async () => {
  const member = await partialAdminFixture(inject("mockBaseUrl"));
  await member.seed.client.PATCH("/roles/{id}", {
    params: { path: { id: member.roleId } },
    body: {
      data: {
        type: "roles",
        id: member.roleId,
        attributes: { permissions: ["admin:access", "posts:manage"] },
      },
    },
  });
  await session(member.owner);
  const resource = {
    ...postsFixture,
    fields: {
      status: { kind: "enum" as const, values: ["draft", "published"] },
      author: { relation: { type: "users", label: "name", search: true } },
    },
  };
  const result = await ResourcePage({ registry: [resource], type: "posts", screen: "list" });
  expect(result.type.name).not.toBe("RequestNotice");
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="ko" messages={messages}>
      {result}
    </NextIntlClientProvider>,
  );
  expect(html).toContain("<table");
  expect(html).toContain('role="alert"');
});
