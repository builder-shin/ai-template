// @vitest-environment jsdom
import { afterEach, beforeEach, expect, inject, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { resources } from "../src/resources";
import { ResourcePage } from "../src/components/resource/page";
import { RequestNotice } from "../src/components/request-notice";
import { createResourceData } from "../src/lib/resources/data";
import { saveResourceAction, searchResourceOptions } from "../src/lib/resources/actions";
import { memberFixture, partialAdminFixture, seedFixture } from "./test/admin-fixture";
import { intlFixture } from "./test/intl-fixture";
import { appOrigin, appSessionCookieName } from "../src/lib/app-config.mjs";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { sealSession, sessionFromTokens } from "../src/lib/session/cookie";
import { ko, en } from "../src/lib/i18n/catalogs";

const context = vi.hoisted(() => ({
  locale: "ko" as "ko" | "en",
  jar: new Map<string, { value: string }>(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => context.jar.get(name) }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => context.locale,
  getTranslations: async () =>
    createTranslator(intlFixture(context.locale === "ko" ? ko : en, context.locale)),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../src/components/resource/realtime", () => ({ ResourceRealtime: () => null }));
vi.mock("../src/lib/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
beforeEach(() => {
  // jsdom에서도 Node의 Buffer·jose가 같은 Uint8Array 생성자를 보게 한다.
  vi.stubGlobal("Uint8Array", Object.getPrototypeOf(Buffer.prototype).constructor);
  context.jar.clear();
  context.locale = "ko";
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("APP_URL", appOrigin("dev"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const users = resources.find((resource) => resource.type === "users")!;
async function session(owner: { session: Parameters<typeof sessionFromTokens>[0]; id: string }) {
  context.jar.set(appSessionCookieName("development"), {
    value: await sealSession(sessionFromTokens(owner.session, owner.id)),
  });
}
function show(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider {...intlFixture(context.locale === "ko" ? ko : en, context.locale)}>
      {node}
    </NextIntlClientProvider>,
  );
}
function page(screen: "list" | "detail" | "edit", id?: string) {
  return ResourcePage({ registry: resources, type: "users", screen, ...(id ? { id } : {}) });
}
function statusForm(status = "deactivated") {
  const data = new FormData();
  data.set("status", status);
  return data;
}
it("사용자 선언은 메뉴 두 번째에 있고 읽기·수정 범위와 선택지를 제한한다", () => {
  expect(resources.map((resource) => resource.type)).toEqual(["posts", "users"]);
  expect(users).toMatchObject({
    permission: "users:read",
    list: {
      columns: ["name", "email", "status", "roles", "createdAt"],
      filters: {
        "filter[q]": "text",
        "filter[status]": "enum",
        "filter[role]": {
          kind: "relation",
          relation: { type: "roles", label: "name", search: true },
        },
      },
      sort: { fields: ["createdAt", "name", "email"], default: "-createdAt" },
      include: ["roles"],
    },
    detail: {
      fields: [
        "name",
        "email",
        "locale",
        "status",
        "emailVerifiedAt",
        "roles",
        "createdAt",
        "updatedAt",
      ],
    },
    edit: {
      permission: "users:manage",
      fields: { status: "enum", roles: "relation-many" },
      visible: expect.any(Function),
    },
    fields: {
      status: {
        values: ["active", "deactivated", "deleted"],
        inputValues: ["active", "deactivated"],
      },
    },
  });
  expect(users).not.toHaveProperty("create");
  expect(users).not.toHaveProperty("delete");
  expect(users.fields).not.toHaveProperty("avatar");
});
it("실제 목의 검색·상태·역할 필터와 역할 검색 Action이 같은 대상을 고른다", async () => {
  const actor = await partialAdminFixture(inject("mockBaseUrl"), "ko", [
    "admin:access",
    "users:read",
    "users:manage",
    "roles:read",
    "posts:create",
  ]);
  const member = await memberFixture(inject("mockBaseUrl"));
  const { data: role } = await actor.seed.client.POST("/roles", {
    body: {
      data: {
        type: "roles",
        attributes: { name: `filter-${member.userId}`, permissions: ["posts:create"] },
      },
    },
  });
  await actor.seed.client.PATCH("/users/{id}", {
    params: { path: { id: member.userId } },
    body: {
      data: {
        type: "users",
        id: member.userId,
        attributes: { status: "deactivated" },
        relationships: { roles: { data: [{ type: "roles", id: role!.data.id }] } },
      },
    },
  });
  const data = createResourceData(actor.owner.client);
  const matching = {
    "filter[q]": member.account.email,
    "filter[status]": "deactivated",
    "filter[role]": role!.data.id,
  };
  expect((await data.list(users, matching)).data.map((record) => record.id)).toEqual([
    member.userId,
  ]);
  expect((await data.list(users, { ...matching, "filter[status]": "active" })).data).toEqual([]);
  await session(actor.owner);
  expect(await searchResourceOptions("users", "list", "role", `filter-${member.userId}`)).toEqual([
    { value: role!.data.id, label: `filter-${member.userId}` },
  ]);
  show(
    await ResourcePage({
      registry: resources,
      type: "users",
      screen: "list",
      searchParams: matching,
    }),
  );
  expect(screen.getByRole("combobox", { name: "역할" }).textContent).toContain(
    `filter-${member.userId}`,
  );
  expect(screen.getByRole("row", { name: new RegExp(member.account.email) })).toBeDefined();
});
it("상태·역할 수정 Action은 영문 상세로 돌아가고 실제 문서에 두 값을 저장한다", async () => {
  const actor = await partialAdminFixture(inject("mockBaseUrl"), "en", [
    "admin:access",
    "users:read",
    "users:manage",
    "roles:read",
    "posts:create",
  ]);
  const member = await memberFixture(inject("mockBaseUrl"));
  const { data: role } = await actor.seed.client.POST("/roles", {
    body: {
      data: {
        type: "roles",
        attributes: { name: `edit-${member.userId}`, permissions: ["posts:create"] },
      },
    },
  });
  await session(actor.owner);
  context.locale = "en";
  const form = statusForm();
  form.append("roles", role!.data.id);
  form.set("__present_roles", "1");
  form.set("name", "보내지 않는 이름");
  await expect(
    saveResourceAction("users", "edit", member.userId, { ok: true }, form),
  ).rejects.toMatchObject({ digest: `NEXT_REDIRECT;replace;/en/users/${member.userId};307;` });
  const record = await createResourceData(actor.owner.client).detail(users, member.userId);
  expect(record.data.attributes).toMatchObject({
    name: member.account.name,
    status: "deactivated",
  });
  expect(record.data.relationships?.roles?.data).toEqual([{ type: "roles", id: role!.data.id }]);
});
it("탈퇴 사용자의 수정 화면·저장은 409이며 PATCH 없이 최신 조건을 확인한다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  const member = await memberFixture(inject("mockBaseUrl"));
  await member.owner.client.DELETE("/me");
  await session(seed);
  const result = await page("edit", member.userId);
  expect(result.type).toBe(RequestNotice);
  expect(result.props.error).toMatchObject({ status: 409, code: "resource.conflict" });
  const requests = vi.spyOn(globalThis, "fetch");
  try {
    expect(
      await saveResourceAction("users", "edit", member.userId, { ok: true }, statusForm()),
    ).toMatchObject({ ok: false, formError: "현재 상태에서는 요청을 처리할 수 없습니다." });
    expect(requests.mock.calls.some(([request]) => (request as Request).method === "PATCH")).toBe(
      false,
    );
  } finally {
    requests.mockRestore();
  }
  show(await page("detail", member.userId));
  expect(screen.getByText("사용자", { selector: "dd span" })).toBeDefined();
  expect(screen.queryByRole("link", { name: "수정" })).toBeNull();
});
it.each(["self", "higher"] as const)(
  "백엔드의 사용자 수정 403은 실제 폼 배너에 표시한다: %s",
  async (target) => {
    const actor = await partialAdminFixture(inject("mockBaseUrl"), "ko", [
      "admin:access",
      "users:read",
      "users:manage",
      "roles:read",
      "posts:create",
    ]);
    const id =
      target === "self" ? actor.userId : (await actor.seed.client.GET("/me")).data!.data.id;
    await session(actor.owner);
    show(await page("edit", id));
    await userEvent.setup().click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("이 작업을 할 권한이 없습니다."),
    );
  },
);
it.each([false, true])("수정 화면은 users:manage 권한을 확인한다: %s", async (manage) => {
  const actor = await partialAdminFixture(inject("mockBaseUrl"), "ko", [
    "admin:access",
    "users:read",
    "roles:read",
    ...(manage ? ["users:manage" as const] : []),
  ]);
  await session(actor.owner);
  const target = await memberFixture(inject("mockBaseUrl"));
  if (!manage)
    await expect(page("edit", target.userId)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/forbidden;307;",
    });
  else {
    show(await page("edit", target.userId));
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "상태" }));
    const choices = await screen.findAllByRole("option");
    expect(choices.map((option) => option.textContent)).toEqual(["활성", "비활성"]);
  }
});
it("roles:read 없는 관리자의 역할 입력만 막고 상태 저장은 유지한다", async () => {
  const actor = await partialAdminFixture(inject("mockBaseUrl"), "ko", [
    "admin:access",
    "users:read",
    "users:manage",
    "posts:create",
  ]);
  await session(actor.owner);
  const member = await memberFixture(inject("mockBaseUrl"));
  show(await page("edit", member.userId));
  expect(screen.getByRole("combobox", { name: "역할" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("alert").textContent).toBe("이 작업을 할 권한이 없습니다.");
  expect(screen.getByRole("button", { name: "저장" }).hasAttribute("disabled")).toBe(false);
  await expect(
    saveResourceAction("users", "edit", member.userId, { ok: true }, statusForm()),
  ).rejects.toMatchObject({ digest: `NEXT_REDIRECT;replace;/users/${member.userId};307;` });
  expect(
    (await createResourceData(actor.owner.client).detail(users, member.userId)).data.attributes
      .status,
  ).toBe("deactivated");
});
it.each([false, true])(
  "등록한 사용자로 가는 글 작성자 링크는 users:read 권한을 따른다: %s",
  async (read) => {
    const actor = await partialAdminFixture(inject("mockBaseUrl"), "ko", [
      "admin:access",
      "posts:manage",
      ...(read ? ["users:read" as const] : []),
    ]);
    const author = await memberFixture(inject("mockBaseUrl"));
    const { data } = await author.owner.client.POST("/posts", {
      body: {
        data: {
          type: "posts",
          attributes: { title: author.userId, body: "본문", status: "draft" },
        },
      },
    });
    await session(actor.owner);
    show(
      await ResourcePage({
        registry: resources,
        type: "posts",
        screen: "detail",
        id: data!.data.id,
      }),
    );
    const link = screen.queryByRole("link", { name: author.account.name });
    if (read) expect(link?.getAttribute("href")).toBe(`/users/${author.userId}`);
    else {
      expect(link).toBeNull();
      expect(screen.getByText(author.account.name)).toBeDefined();
    }
  },
);
it("사용자 목록·상세는 이름 없는 레코드의 번역 대체값을 표시한다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  const member = await memberFixture(inject("mockBaseUrl"));
  await member.owner.client.DELETE("/me");
  await session(seed);
  const list = await createResourceData(seed.client).list(users, { "filter[status]": "deleted" });
  expect(list.data.find((record) => record.id === member.userId)?.attributes.name).toBeNull();
  show(
    await ResourcePage({
      registry: resources,
      type: "users",
      screen: "list",
      searchParams: { "filter[status]": "deleted" },
    }),
  );
  expect(screen.getAllByText("사용자", { selector: "td span" }).length).toBeGreaterThan(0);
  cleanup();
  show(await page("detail", member.userId));
  expect(screen.getByText("사용자", { selector: "dd span" })).toBeDefined();
});
