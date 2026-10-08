import { beforeEach, afterEach, expect, inject, it, vi } from "vitest";
import { createResourceData } from "../src/lib/resources/data";
import { searchResourceOptions } from "../src/lib/resources/actions";
import { postsFixture } from "./test/resource-fixture";
import { seedFixture, memberFixture } from "./test/admin-fixture";
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
it("관계 검색은 선언한 대상 목록만 읽는다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  await session(seed);
  const { member } = await post();
  const options = await searchResourceOptions("posts", "list", "author", member.account.email);
  expect(options).toEqual([{ value: member.userId, label: "관리 테스트" }]);
  await expect(searchResourceOptions("posts", "list", "notDeclared", "")).rejects.toThrow();
});
