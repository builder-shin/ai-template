// @vitest-environment jsdom
import { afterEach, expect, inject, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { ListScreen } from "./screen";
import { defineResource } from "../../lib/resources/definition";
import { seedFixture } from "../../../scripts/test/admin-fixture";
import { intlFixture } from "../../../scripts/test/intl-fixture";
import ko from "../../../messages/ko.json";
import shared from "../../../messages/shared/ko.json";

vi.mock("../../lib/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../lib/resources/actions", () => ({
  searchResourceOptions: async () => [],
  deleteResourceAction: async () => ({ ok: true }),
  runResourceAction: async () => ({ ok: true }),
}));
afterEach(cleanup);
const messages = {
  ...shared,
  ...ko,
  resources: {
    users: {
      title: "사용자",
      fields: { role: "역할", status: "상태" },
      enums: { status: { active: "활성", deactivated: "비활성", deleted: "탈퇴" } },
    },
  },
};
const resource = defineResource({
  type: "users",
  permission: "users:read",
  fields: {
    status: {
      kind: "enum",
      values: ["active", "deactivated", "deleted"],
      inputValues: ["active", "deactivated"],
    },
  },
  list: {
    columns: [],
    filters: {
      "filter[role]": {
        kind: "relation",
        relation: { type: "roles", label: "name", search: true },
      },
      "filter[status]": "enum",
    },
  },
});
it("필드 이름과 다른 관계 필터는 자체 선언으로 옵션을 읽고 enum 필터는 모든 상태를 유지한다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  const request = vi.spyOn(seed.client, "request");
  const node = await ListScreen({
    context: {
      resource,
      client: seed.client,
      permissions: ["users:read"],
      locale: "ko",
      timeZone: "Asia/Seoul",
      translate: createTranslator(intlFixture(messages)) as (key: string) => string,
      linkable: () => false,
    },
    document: {
      data: [],
      included: [{ type: "roles", id: "outside", attributes: { name: "선택한 역할" } }],
      meta: { page: { number: 1, totalPages: 1, total: 0 } },
    },
    query: { "filter[role]": "outside" },
  });
  render(<NextIntlClientProvider {...intlFixture(messages)}>{node}</NextIntlClientProvider>);
  expect(request).toHaveBeenCalledWith("get", "/roles", expect.anything());
  expect(screen.getByRole("combobox", { name: "역할" }).textContent).toContain("선택한 역할");
  await userEvent.setup().click(screen.getByRole("combobox", { name: "상태" }));
  expect(await screen.findByRole("option", { name: "탈퇴" })).toBeDefined();
});
