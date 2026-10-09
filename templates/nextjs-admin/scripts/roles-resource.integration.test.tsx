// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, inject, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { resources } from "../src/resources";
import { ResourcePage } from "../src/components/resource/page";
import { createResourceData } from "../src/lib/resources/data";
import { saveResourceAction, deleteResourceAction } from "../src/lib/resources/actions";
import { controlsFor } from "../src/lib/resources/access";
import { partialAdminFixture } from "./test/admin-fixture";
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
vi.mock("../src/lib/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
beforeEach(() => {
  // Node의 Buffer와 jose가 jsdom에서도 같은 Uint8Array 생성자를 보게 한다.
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
const allCodes = [
  "admin:access",
  "audit-logs:read",
  "posts:create",
  "posts:manage",
  "roles:manage",
  "roles:read",
  "users:manage",
  "users:read",
] as const;
const roles = resources.find((resource) => resource.type === "roles")!;
const permissions = resources.find((resource) => resource.type === "permissions")!;
async function actor(
  locale: "ko" | "en" = "ko",
  codes: readonly (typeof allCodes)[number][] = allCodes,
) {
  const account = await partialAdminFixture(inject("mockBaseUrl"), locale, codes);
  context.locale = locale;
  context.jar.set(appSessionCookieName("development"), {
    value: await sealSession(sessionFromTokens(account.owner.session, account.owner.id)),
  });
  return account;
}
function show(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider {...intlFixture(context.locale === "ko" ? ko : en, context.locale)}>
      {node}
    </NextIntlClientProvider>,
  );
}
function page(
  type: "roles" | "permissions",
  screen: "list" | "detail" | "create" | "edit",
  id?: string,
) {
  return ResourcePage({ registry: resources, type, screen, ...(id ? { id } : {}) });
}
function form(name: string, codes: readonly string[], description = "역할 설명") {
  const data = new FormData();
  data.set("name", name);
  data.set("description", description);
  data.set("__present_permissions", "1");
  for (const code of codes) data.append("permissions", code);
  return data;
}
async function system(account: Awaited<ReturnType<typeof actor>>, name = "member") {
  return (
    await createResourceData(account.owner.client).list(roles, { "filter[q]": name })
  ).data.find((record) => record.attributes.name === name)!;
}

it("역할·권한 메뉴는 사용자 뒤에 등록하고 권한 목록은 읽기만 허용한다", () => {
  expect(resources.map((resource) => resource.type)).toEqual([
    "posts",
    "users",
    "roles",
    "permissions",
  ]);
  expect(roles.list.columns).toEqual(["name", "isSystem", "createdAt"]);
  expect(permissions.list.columns).toEqual(["id", "group", "description"]);
  expect(permissions).not.toHaveProperty("detail");
  expect(permissions.list).not.toHaveProperty("filters");
  expect(permissions.list).not.toHaveProperty("sort");
});
it("생성 Action은 권한 배열을 저장하고 수정 Action은 빈 배열도 저장한다", async () => {
  const account = await actor();
  const data = createResourceData(account.owner.client);
  const name = `role-${randomUUID()}`;
  await expect(
    saveResourceAction(
      "roles",
      "create",
      null,
      { ok: true },
      form(name, ["posts:create", "posts:manage"]),
    ),
  ).rejects.toMatchObject({
    digest: expect.stringMatching(/^NEXT_REDIRECT;replace;\/roles\/.+;307;$/),
  });
  const record = (await data.list(roles, { "filter[q]": name })).data[0]!;
  const detail = await data.detail(roles, record.id);
  expect(detail.data.attributes).toMatchObject({
    name,
    description: "역할 설명",
    permissions: ["posts:create", "posts:manage"],
  });
  show(await page("roles", "detail", record.id));
  expect(screen.getByText("글 작성").getAttribute("data-slot")).toBe("badge");
  expect(screen.getByText("전체 글 관리").getAttribute("data-slot")).toBe("badge");
  await expect(
    saveResourceAction("roles", "edit", record.id, { ok: true }, form(`${name}-edited`, [])),
  ).rejects.toMatchObject({ digest: `NEXT_REDIRECT;replace;/roles/${record.id};307;` });
  expect((await data.detail(roles, record.id)).data.attributes.permissions).toEqual([]);
});
it("중복 이름의 실제 pointer는 이름 입력에 붙고 모든 입력값을 유지한다", async () => {
  const account = await actor();
  const name = `duplicate-${randomUUID()}`;
  await createResourceData(account.owner.client).create(roles, {
    name,
    permissions: ["posts:create"],
  });
  await expect(
    createResourceData(account.owner.client).create(roles, { name, permissions: [] }),
  ).rejects.toMatchObject({
    status: 422,
    code: "validation.already_taken",
    errors: [expect.objectContaining({ pointer: "/data/attributes/name" })],
  });
  show(await page("roles", "create"));
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "이름" }), name);
  await user.type(screen.getByRole("textbox", { name: "설명" }), "유지할 설명");
  await user.click(await screen.findByRole("checkbox", { name: "글 작성" }));
  await user.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByText("이미 사용 중인 값입니다.")).toBeDefined();
  expect((screen.getByRole("textbox", { name: "이름" }) as HTMLInputElement).value).toBe(name);
  expect((screen.getByRole("textbox", { name: "설명" }) as HTMLTextAreaElement).value).toBe(
    "유지할 설명",
  );
  expect(screen.getByRole("checkbox", { name: "글 작성" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  expect(screen.getByRole("textbox", { name: "이름" }).getAttribute("aria-invalid")).toBe("true");
});
it.each(["read-only", "system"] as const)(
  "삭제 Action의 %s 거절은 DELETE 없이 최신 조건을 지킨다",
  async (target) => {
    const account = await actor(
      "ko",
      target === "read-only" ? ["admin:access", "roles:read"] : allCodes,
    );
    const record = await system(account);
    const requests = vi.spyOn(globalThis, "fetch");
    try {
      expect(await deleteResourceAction("roles", record.id)).toMatchObject({
        ok: false,
        formError:
          target === "read-only"
            ? "이 작업을 할 권한이 없습니다."
            : "현재 상태에서는 요청을 처리할 수 없습니다.",
      });
      expect(
        requests.mock.calls.some(([request]) => (request as Request).method === "DELETE"),
      ).toBe(false);
    } finally {
      requests.mockRestore();
    }
    expect(controlsFor(roles, allCodes, record).delete).toBe(false);
    expect(
      (await createResourceData(account.owner.client).detail(roles, record.id)).data.attributes
        .name,
    ).toBe("member");
  },
);
it.each(["member-name", "admin-permissions"] as const)(
  "시스템 역할의 %s 변경 거부는 번역한 폼 배너다",
  async (target) => {
    const account = await actor();
    const record = await system(account, target === "member-name" ? "member" : "admin");
    show(await page("roles", "edit", record.id));
    const user = userEvent.setup();
    if (target === "member-name") {
      const input = screen.getByRole("textbox", { name: "이름" });
      await user.clear(input);
      await user.type(input, "변경할 이름");
    } else await user.click(await screen.findByRole("checkbox", { name: "글 작성" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("시스템 역할은 변경할 수 없습니다."),
    );
  },
);
it("상위 권한 역할의 수정은 API의 403을 폼 배너로 알린다", async () => {
  const account = await actor("ko", ["admin:access", "roles:read", "roles:manage"]);
  const { data } = await account.seed.client.POST("/roles", {
    body: {
      data: {
        type: "roles",
        attributes: { name: `higher-${randomUUID()}`, permissions: ["posts:manage"] },
      },
    },
  });
  show(await page("roles", "edit", data!.data.id));
  await userEvent.setup().click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("이 작업을 할 권한이 없습니다."),
  );
});
it.each(["ko", "en"] as const)(
  "권한 선택기는 API 옵션을 접두사로 묶고 번역한 이름을 제출한다: %s",
  async (locale) => {
    await actor(locale);
    show(await page("roles", "create"));
    const group = await screen.findByRole("group", { name: "posts" });
    const label = locale === "ko" ? "글 작성" : "Write posts";
    expect(within(group).getAllByRole("checkbox")).toHaveLength(2);
    const checkbox = await within(group).findByRole("checkbox", { name: label });
    await userEvent.setup().click(checkbox);
    expect(new FormData(checkbox.closest("form")!).getAll("permissions")).toEqual(["posts:create"]);
    expect(screen.getAllByRole("checkbox")).toHaveLength(8);
  },
);
it("권한 목록은 실제 API의 모든 코드·그룹·설명을 표시하고 행 링크가 없다", async () => {
  const account = await actor();
  const data = await createResourceData(account.owner.client).list(permissions);
  expect(data.data.map((record) => record.id).sort()).toEqual(allCodes);
  show(await page("permissions", "list"));
  for (const code of allCodes) expect(screen.getByRole("cell", { name: code })).toBeDefined();
  expect(screen.getByText("Sign in to the admin app.")).toBeDefined();
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByRole("button", { name: "삭제" })).toBeNull();
});
