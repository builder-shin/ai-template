import { afterEach, beforeEach, expect, inject, it, vi } from "vitest";
import { resources } from "../src/resources";
import { runResourceAction } from "../src/lib/resources/actions";
import { controlsFor, findScreen, visibleResources } from "../src/lib/resources/access";
import { missingResourceMessages } from "../src/lib/resources/messages";
import { memberFixture, partialAdminFixture, seedFixture } from "./test/admin-fixture";
import { appOrigin, appSessionCookieName } from "../src/lib/app-config.mjs";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { sealSession, sessionFromTokens } from "../src/lib/session/cookie";
import ko from "../messages/ko.json";
import en from "../messages/en.json";
import { startMock } from "./test/mock-server";

const state = vi.hoisted(() => ({ jar: new Map<string, { value: string }>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (key: string) => state.jar.get(key) }),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "ko" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
beforeEach(() => {
  state.jar.clear();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("APP_URL", appOrigin("dev"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
});
afterEach(() => vi.unstubAllEnvs());
async function session(owner: Awaited<ReturnType<typeof seedFixture>>) {
  state.jar.set(appSessionCookieName("development"), {
    value: await sealSession(sessionFromTokens(owner.session, owner.id)),
  });
}
async function draft() {
  const member = await memberFixture(inject("mockBaseUrl"));
  const response = await member.owner.client.POST("/posts", {
    body: {
      data: {
        type: "posts",
        attributes: { title: "골든 글", body: "유지할 본문", status: "draft" },
      },
    },
  });
  return { member, record: response.data!.data };
}
it("글 골든은 계약의 읽기·관리 동작만 등록하고 양쪽 문구를 갖춘다", () => {
  expect(resources.map((resource) => resource.type)).toEqual(["posts"]);
  const posts = resources[0]!;
  expect(posts.list).toEqual({
    columns: ["title", "author", "status", "publishedAt", "createdAt"],
    filters: { "filter[q]": "text", "filter[status]": "enum", "filter[author]": "relation" },
    sort: { fields: ["createdAt", "publishedAt", "title"], default: "-createdAt" },
    include: ["author"],
  });
  expect(posts.realtime).toEqual({ channel: "posts:all" });
  expect(findScreen(resources, "posts", "create")).toBeUndefined();
  expect(findScreen(resources, "posts", "edit")).toBeUndefined();
  expect(visibleResources(resources, ["admin:access"])).toEqual([]);
  expect(missingResourceMessages(resources, { ko, en })).toEqual([]);
});
it("발행·발행 취소는 상태만 PATCH하고 최신 조건으로 버튼과 요청을 막는다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  await session(seed);
  const { record } = await draft();
  expect(await runResourceAction("posts", "publish", record.id)).toEqual({ ok: true });
  const published = (await seed.client.GET("/posts/{id}", { params: { path: { id: record.id } } }))
    .data!.data;
  expect(published.attributes).toMatchObject({
    title: "골든 글",
    body: "유지할 본문",
    status: "published",
  });
  expect(published.attributes.publishedAt).toEqual(expect.any(String));
  expect(
    controlsFor(resources[0]!, ["posts:manage"], published).actions.map((action) => action.name),
  ).toEqual(["unpublish"]);
  expect(await runResourceAction("posts", "publish", record.id)).toMatchObject({ ok: false });
  expect(await runResourceAction("posts", "unpublish", record.id)).toEqual({ ok: true });
  const unpublished = (
    await seed.client.GET("/posts/{id}", { params: { path: { id: record.id } } })
  ).data!.data;
  expect(unpublished.attributes).toMatchObject({
    status: "draft",
    title: "골든 글",
    body: "유지할 본문",
  });
  expect(
    controlsFor(resources[0]!, ["posts:manage"], unpublished).actions.map((action) => action.name),
  ).toEqual(["publish"]);
});
it("추가 권한 없는 관리자는 직접 글 동작을 호출해도 상태를 바꾸지 못한다", async () => {
  const partial = await partialAdminFixture(inject("mockBaseUrl"));
  await session(partial.owner);
  const { record, member } = await draft();
  expect(await runResourceAction("posts", "publish", record.id)).toMatchObject({ ok: false });
  const direct = resources[0]!.actions!.find((action) => action.name === "publish")!;
  expect(await direct.action(record.id)).toMatchObject({ ok: false });
  expect(
    (await member.owner.client.GET("/posts/{id}", { params: { path: { id: record.id } } })).data!
      .data.attributes.status,
  ).toBe("draft");
});
it("없는 글의 동작은 번역한 오류로 반환한다", async () => {
  await session(await seedFixture(inject("mockBaseUrl")));
  expect(
    await runResourceAction("posts", "publish", "01900000-0000-7000-8000-000000000000"),
  ).toMatchObject({ ok: false, formError: expect.any(String) });
});
it("글 Server Action은 실제 429의 Retry-After를 안내 상태에 보존한다", async () => {
  const mock = await startMock({ env: { RATE_LIMIT_GLOBAL: "12" } });
  try {
    await session(await seedFixture(mock.base));
    vi.stubEnv("API_BASE_URL", `${mock.base}/api/v1`);
    let status = 200;
    for (let index = 0; index < 15 && status !== 429; index++)
      status = (
        await fetch(`${mock.base}/api/v1/posts`, {
          headers: { Accept: "application/vnd.api+json" },
        })
      ).status;
    expect(status).toBe(429);
    const publish = resources[0]!.actions!.find((action) => action.name === "publish")!;
    expect(await publish.action("01900000-0000-7000-8000-000000000000")).toMatchObject({
      ok: false,
      formError: expect.any(String),
      retryAfter: expect.any(Number),
    });
  } finally {
    await mock.stop();
  }
});
