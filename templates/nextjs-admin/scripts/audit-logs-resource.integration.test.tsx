// @vitest-environment jsdom
import { afterEach, beforeEach, expect, inject, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { ResourcePage } from "../src/components/resource/page";
import { createResourceData } from "../src/lib/resources/data";
import { resources } from "../src/resources";
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
vi.mock("../src/lib/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
beforeEach(() => {
  vi.stubGlobal("Uint8Array", Object.getPrototypeOf(Buffer.prototype).constructor);
  context.jar.clear();
  context.locale = "ko";
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("APP_URL", appOrigin("dev"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
  vi.stubEnv("TIME_ZONE", "Asia/Seoul");
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const audit = resources.find((resource) => resource.type === "audit-logs")!;
async function prepare(users = false) {
  const actor = await partialAdminFixture(inject("mockBaseUrl"), "ko", [
    "admin:access",
    "audit-logs:read",
    "roles:read",
    "roles:manage",
    ...(users ? ["users:read" as const] : []),
  ]);
  const name = `감사-${actor.userId}`;
  const { data: role } = await actor.owner.client.POST("/roles", {
    body: { data: { type: "roles", attributes: { name, permissions: [] } } },
  });
  const data = createResourceData(actor.owner.client);
  const query = { "filter[action]": "role.created", "filter[actor]": actor.userId };
  const document = await data.list(audit, query);
  const log = document.data.find((record) => record.attributes.targetId === role!.data.id)!;
  context.jar.set(appSessionCookieName("development"), {
    value: await sealSession(sessionFromTokens(actor.owner.session, actor.owner.id)),
  });
  return { actor, name, role: role!.data, data, query, log };
}
function show(node: React.ReactNode) {
  render(
    <NextIntlClientProvider {...intlFixture(context.locale === "ko" ? ko : en, context.locale)}>
      {node}
    </NextIntlClientProvider>,
  );
}
it("감사 로그는 마지막 메뉴의 읽기 전용 목록·상세와 최근순 기본 정렬을 선언한다", () => {
  expect(resources.map((resource) => resource.type)).toEqual([
    "posts",
    "users",
    "roles",
    "permissions",
    "audit-logs",
  ]);
  expect(audit.list.columns).toEqual(["createdAt", "actor", "action", "targetType", "targetId"]);
  expect(audit.list.sort).toEqual({ fields: ["createdAt"], default: "-createdAt" });
  expect(audit.detail?.fields).toEqual([
    "action",
    "actor",
    "targetType",
    "targetId",
    "metadata",
    "ipAddress",
    "createdAt",
  ]);
  expect(audit.fields?.action?.values).toHaveLength(13);
  for (const mode of ["create", "edit", "delete", "actions", "realtime"])
    expect(audit).not.toHaveProperty(mode);
});
it("실제 목에서 행위·행위자·대상 종류·서울 날짜 기간으로 거르고 배타적 끝 경계를 지킨다", async () => {
  const { actor, data, query, log } = await prepare();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(log.attributes.createdAt));
  expect(
    (
      await data.list(audit, {
        ...query,
        "filter[targetType]": "roles",
        "filter[createdFrom]": today,
        "filter[createdTo]": today,
      })
    ).data.map((record) => record.id),
  ).toEqual([log.id]);
  expect((await data.list(audit, { ...query, "filter[action]": "role.updated" })).data).toEqual([]);
  const seedUserId = (await actor.seed.client.GET("/me")).data!.data.id;
  expect(
    (await data.list(audit, { ...query, "filter[actor]": seedUserId })).data.some(
      (record) => record.id === log.id,
    ),
  ).toBe(false);
  expect((await data.list(audit, { ...query, "filter[targetType]": "users" })).data).toEqual([]);
  expect(
    (await data.list(audit, { ...query, "filter[createdTo]": log.attributes.createdAt })).data,
  ).toEqual([]);
  expect(
    (
      await data.list(audit, { ...query, "filter[createdFrom]": log.attributes.createdAt })
    ).data.map((record) => record.id),
  ).toEqual([log.id]);
});
it("단건의 메타데이터와 공개 행위자 이름·권한별 상세 링크를 표시한다", async () => {
  const { actor, name, role, data, log } = await prepare(true);
  const document = await data.detail(audit, log.id);
  expect(document.data.attributes.metadata).toMatchObject({ name });
  expect(
    document.included?.find((record) => record.id === actor.userId)?.attributes,
  ).not.toHaveProperty("email");
  show(
    await ResourcePage({ registry: resources, type: "audit-logs", screen: "detail", id: log.id }),
  );
  expect(screen.getByText(name)).toBeDefined();
  expect(screen.getByRole("link", { name: actor.account.name }).getAttribute("href")).toBe(
    `/users/${actor.userId}`,
  );
  expect(screen.getByRole("link", { name: role.id }).getAttribute("href")).toBe(
    `/roles/${role.id}`,
  );
  expect(screen.queryByRole("button", { name: "삭제" })).toBeNull();
});
it("감사 로그만 읽는 관리자는 행위자 필터의 403 안내와 이름만 보고 상세 링크는 보지 않는다", async () => {
  const { actor, query } = await prepare();
  await actor.seed.client.PATCH("/roles/{id}", {
    params: { path: { id: actor.roleId } },
    body: {
      data: {
        type: "roles",
        id: actor.roleId,
        attributes: { permissions: ["admin:access", "audit-logs:read"] },
      },
    },
  });
  show(
    await ResourcePage({
      registry: resources,
      type: "audit-logs",
      screen: "list",
      searchParams: query,
    }),
  );
  expect(screen.getByRole("combobox", { name: "행위자" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("alert").textContent).toBe("이 작업을 할 권한이 없습니다.");
  expect(screen.getByRole("cell", { name: actor.account.name })).toBeDefined();
  expect(screen.queryByRole("link", { name: actor.account.name })).toBeNull();
  expect(
    screen
      .getAllByRole("link")
      .every(
        (link) =>
          !link.getAttribute("href")?.startsWith("/roles/") &&
          !link.getAttribute("href")?.startsWith("/users/"),
      ),
  ).toBe(true);
});
it.each(["create", "edit"] as const)(
  "감사 로그에 없는 쓰기 화면은 API 전에 404다: %s",
  async (mode) => {
    await expect(
      ResourcePage({ registry: resources, type: "audit-logs", screen: mode }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
);
it("ISO 기간 URL을 서울 달력 날짜로 표시하고 적용할 날짜를 유지한다", async () => {
  await prepare(true);
  show(
    await ResourcePage({
      registry: resources,
      type: "audit-logs",
      screen: "list",
      searchParams: {
        "filter[createdFrom]": "2026-10-07T15:00:00.000Z",
        "filter[createdTo]": "2026-10-08T15:00:00.000Z",
      },
    }),
  );
  expect((screen.getByLabelText("시작 날짜") as HTMLInputElement).value).toBe("2026-10-08");
  expect((screen.getByLabelText("종료 날짜") as HTMLInputElement).value).toBe("2026-10-08");
});
