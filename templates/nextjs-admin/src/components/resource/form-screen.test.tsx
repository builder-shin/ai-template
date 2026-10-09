// @vitest-environment jsdom
import { afterEach, expect, inject, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { FormScreen, type ScreenContext } from "./screen";
import type { InputProps } from "./types";
import { defineResource } from "../../lib/resources/definition";
import { createApiClient } from "../../lib/api/client";
import { postsFixture } from "../../../scripts/test/resource-fixture";
import { seedFixture, partialAdminFixture } from "../../../scripts/test/admin-fixture";
import ko from "../../../messages/ko.json";
import shared from "../../../messages/shared/ko.json";
import { intlFixture } from "../../../scripts/test/intl-fixture";

const messages = {
  ...shared,
  ...ko,
  resources: {
    ...ko.resources,
    users: {
      title: "사용자",
      fields: { status: "상태", roles: "역할" },
      enums: { status: { active: "활성", deactivated: "비활성", deleted: "탈퇴" } },
    },
  },
};

const submitted = vi.hoisted(() => ({ data: null as FormData | null }));
vi.mock("../../lib/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("../../lib/resources/actions", () => ({
  saveResourceAction: async (
    _type: string,
    _mode: string,
    _id: string,
    _state: unknown,
    data: FormData,
  ) => {
    submitted.data = data;
    return { ok: true };
  },
  deleteResourceAction: async () => ({ ok: true }),
  runResourceAction: async () => ({ ok: true }),
  searchResourceOptions: async () => [],
}));
afterEach(() => {
  cleanup();
  submitted.data = null;
});
function context(
  resource: ScreenContext["resource"],
  client: ScreenContext["client"],
): ScreenContext {
  return {
    resource,
    client,
    permissions: ["admin:access"],
    locale: "ko",
    timeZone: "Asia/Seoul",
    translate: createTranslator(intlFixture(messages)) as (key: string) => string,
    linkable: () => false,
  };
}
function show(node: React.ReactNode) {
  return render(<NextIntlClientProvider {...intlFixture(messages)}>{node}</NextIntlClientProvider>);
}
const users = defineResource({
  type: "users",
  permission: "users:read",
  list: { columns: ["name"], include: ["roles"] },
  fields: {
    status: {
      kind: "enum",
      values: ["active", "deactivated", "deleted"],
      inputValues: ["active", "deactivated"],
    },
    roles: { relation: { type: "roles", label: "name", search: true } },
  },
  edit: { permission: "users:manage", fields: { status: "enum", roles: "relation-many" } },
});
const record = {
  type: "users",
  id: "u",
  attributes: { status: "active" },
  relationships: { roles: { data: [{ type: "roles", id: "outside" }] } },
};

it("텍스트에는 옵션을 주지 않고 열거값에는 선언한 옵션만 준다", async () => {
  function Options({ name, options }: InputProps) {
    return (
      <output aria-label={name}>
        {options ? options.map((option) => option.value).join(",") : "없음"}
      </output>
    );
  }
  const resource = defineResource({
    ...postsFixture,
    fields: {
      title: { input: Options },
      status: { values: ["draft", "published"], input: Options },
    },
    edit: { permission: "posts:manage", fields: { title: "text", status: "enum" } },
  });
  const seed = await seedFixture(inject("mockBaseUrl"));
  show(
    await FormScreen({
      context: context(resource, seed.client),
      mode: "edit",
      record: { type: "posts", id: "p", attributes: { title: "제목", status: "invalid" } },
    }),
  );
  expect(screen.getByLabelText("title").textContent).toBe("없음");
  expect(screen.getByLabelText("status").textContent).toBe("draft,published");
});
it("관계의 첫 페이지 밖 현재값은 included 라벨을 쓰며 추가 요청이 없다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  const request = vi.spyOn(seed.client, "request");
  try {
    show(
      await FormScreen({
        context: context(users, seed.client),
        mode: "edit",
        record,
        included: [{ type: "roles", id: "outside", attributes: { name: "포함한 역할" } }],
      }),
    );
    expect(screen.getByRole("combobox", { name: "역할" }).textContent).toContain("포함한 역할");
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    request.mockRestore();
  }
});
it("수정 입력은 inputValues만 쓰고 표시·필터 values를 바꾸지 않는다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  show(await FormScreen({ context: context(users, seed.client), mode: "edit", record }));
  await userEvent.setup().click(screen.getByRole("combobox", { name: "상태" }));
  const options = await screen.findAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual(["활성", "비활성"]);
  expect(users.fields?.status?.values).toEqual(["active", "deactivated", "deleted"]);
});
it("관계 옵션의 403은 해당 입력만 막고 다른 입력의 저장은 유지한다", async () => {
  const actor = await partialAdminFixture(inject("mockBaseUrl"));
  show(await FormScreen({ context: context(users, actor.owner.client), mode: "edit", record }));
  expect(screen.getByRole("combobox", { name: "역할" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("alert").textContent).toBe("이 작업을 할 권한이 없습니다.");
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "상태" }));
  await user.click(await screen.findByRole("option", { name: "비활성" }));
  await user.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(submitted.data?.get("status")).toBe("deactivated"));
  expect(submitted.data?.has("roles")).toBe(false);
  expect(submitted.data?.has("__present_roles")).toBe(false);
});
it("관계 옵션의 401은 입력 오류로 숨기지 않고 다시 던진다", async () => {
  const client = createApiClient({ baseUrl: `${inject("mockBaseUrl")}/api/v1`, locale: "ko" });
  await expect(
    FormScreen({ context: context(users, client), mode: "edit", record }),
  ).rejects.toMatchObject({ status: 401 });
});
it("상세 없는 수정 폼의 취소는 목록으로 돌아간다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  show(await FormScreen({ context: context(users, seed.client), mode: "edit", record }));
  expect(screen.getByRole("link", { name: "취소" }).getAttribute("href")).toBe("/users");
});
it("다중 열거값의 서버 옵션은 실제 API에서 읽고 카탈로그 라벨을 쓴다", async () => {
  function Options({ options }: InputProps) {
    return (
      <output aria-label="서버 옵션">{options?.map((option) => option.label).join(",")}</output>
    );
  }
  const resource = defineResource({
    type: "roles",
    permission: "roles:read",
    list: { columns: ["name"] },
    fields: {
      permissions: {
        kind: "enum-many",
        values: ["roles:read"],
        input: Options,
        loadValues: async (client) =>
          (await client.GET("/permissions")).data!.data.map((item) => item.id),
      },
    },
    create: { permission: "roles:manage", fields: { permissions: "enum-many" } },
  });
  const seed = await seedFixture(inject("mockBaseUrl"));
  const ctx = context(resource, seed.client);
  ctx.translate = (key) =>
    key === "resources.roles.enums.permissions.roles:read" ? "역할과 권한 조회" : key;
  show(await FormScreen({ context: ctx, mode: "create" }));
  expect(screen.getByLabelText("서버 옵션").textContent).toBe("역할과 권한 조회");
});
