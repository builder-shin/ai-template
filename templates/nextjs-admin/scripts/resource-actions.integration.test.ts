import { beforeEach, afterEach, expect, inject, it, vi } from "vitest";
import { createResourceData } from "../src/lib/resources/data";
import {
  saveResourceAction,
  deleteResourceAction,
  runResourceAction,
  searchResourceOptions,
} from "../src/lib/resources/actions";
import { postsFixture } from "./test/resource-fixture";
import { seedFixture, partialAdminFixture, memberFixture } from "./test/admin-fixture";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { appOrigin, appSessionCookieName } from "../src/lib/app-config.mjs";
import { sealSession, sessionFromTokens } from "../src/lib/session/cookie";

const context = vi.hoisted(() => ({
  locale: "ko",
  jar: new Map<string, { value: string }>(),
  calls: 0,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => context.jar.get(name) }),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => context.locale }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../src/resources/index", async () => {
  const { postsFixture } = await import("./test/resource-fixture");
  return {
    resources: [
      {
        ...postsFixture,
        fields: {
          status: { kind: "enum", values: ["draft", "published"] },
          coverImage: { kind: "file", relation: { type: "files", label: "filename" } },
          author: { kind: "relation", relation: { type: "users", label: "name", search: true } },
        },
        actions: [
          {
            name: "test",
            permission: "posts:manage",
            visible: (record: { attributes: { status: string } }) =>
              record.attributes.status === "draft",
            action: async () => {
              context.calls++;
              return { ok: true };
            },
          },
        ],
      },
    ],
  };
});
beforeEach(() => {
  context.jar.clear();
  context.locale = "ko";
  context.calls = 0;
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
async function post(status: "draft" | "published" = "draft") {
  const member = await memberFixture(inject("mockBaseUrl"));
  const document = await createResourceData(member.owner.client).create(postsFixture, {
    title: "화면 테스트",
    body: "본문",
    status,
  });
  return { document, member };
}
it("폼 검증 오류는 실제 pointer를 필드에 붙인다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  await session(seed);
  const { document } = await post();
  const data = new FormData();
  data.set("title", "");
  const result = await saveResourceAction("posts", "edit", document.data.id, { ok: true }, data);
  expect(result).toMatchObject({
    ok: false,
    fieldErrors: { title: [expect.any(String)] },
    values: { title: "" },
  });
});
it("수정은 선언 필드만 보내고 영문 상세로 이동한다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  await session(seed);
  context.locale = "en";
  const { document } = await post();
  const data = new FormData();
  data.set("title", "수정 결과");
  data.set("body", "보내면 안 되는 본문");
  await expect(
    saveResourceAction("posts", "edit", document.data.id, { ok: true }, data),
  ).rejects.toMatchObject({
    digest: `NEXT_REDIRECT;replace;/en/posts/${document.data.id};307;`,
  });
  const updated = await createResourceData(seed.client).detail(postsFixture, document.data.id);
  expect(updated.data.attributes).toMatchObject({ title: "수정 결과", body: "본문" });
});
it("생성 뒤 새 상세로 이동한다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  await session(seed);
  const data = new FormData();
  data.set("title", "새 글");
  data.set("body", "본문");
  data.set("status", "draft");
  await expect(
    saveResourceAction("posts", "create", null, { ok: true }, data),
  ).rejects.toMatchObject({
    digest: expect.stringMatching(/^NEXT_REDIRECT;replace;\/posts\/.+;307;$/),
  });
});
it("삭제는 실제 API를 호출하고 목록으로 이동한다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  await session(seed);
  const { document } = await post();
  await expect(deleteResourceAction("posts", document.data.id)).rejects.toMatchObject({
    digest: "NEXT_REDIRECT;replace;/posts;307;",
  });
  await expect(
    createResourceData(seed.client).detail(postsFixture, document.data.id),
  ).rejects.toMatchObject({ status: 404 });
});
it("추가 권한 없는 관리자는 숨긴 쓰기 요청도 거절한다", async () => {
  const { owner } = await partialAdminFixture(inject("mockBaseUrl"));
  await session(owner);
  const { document } = await post();
  expect(await deleteResourceAction("posts", document.data.id)).toMatchObject({
    ok: false,
    formError: expect.any(String),
  });
  expect(
    await saveResourceAction("posts", "edit", document.data.id, { ok: true }, new FormData()),
  ).toMatchObject({ ok: false });
  expect(await runResourceAction("posts", "test", document.data.id)).toMatchObject({ ok: false });
  expect(context.calls).toBe(0);
});
it("동작 조건은 서버가 최신 상세에서 다시 확인한다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  await session(seed);
  const { document } = await post("published");
  expect(await runResourceAction("posts", "test", document.data.id)).toMatchObject({ ok: false });
  expect(context.calls).toBe(0);
  const draft = await post();
  expect(await runResourceAction("posts", "test", draft.document.data.id)).toEqual({ ok: true });
  expect(context.calls).toBe(1);
});
it("관계 검색은 선언한 대상 목록만 읽는다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  await session(seed);
  const { member } = await post();
  const options = await searchResourceOptions("posts", "list", "author", member.account.email);
  expect(options).toEqual([{ value: member.userId, label: "관리 테스트" }]);
  await expect(searchResourceOptions("posts", "list", "notDeclared", "")).rejects.toThrow();
});
