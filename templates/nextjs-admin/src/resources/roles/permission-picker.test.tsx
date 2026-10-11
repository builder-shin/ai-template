// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import PermissionPicker from "./permission-picker";
import { ResourceInput } from "../../components/resource/form";
import type { InputProps } from "../../components/resource/types";
import ko from "../../../messages/ko.json";
import en from "../../../messages/en.json";
import { intlFixture } from "../../../scripts/test/intl-fixture";

let originalGroupBy: PropertyDescriptor | undefined;
let originalObjectGroupBy: PropertyDescriptor | undefined;
beforeEach(() => {
  originalGroupBy = Object.getOwnPropertyDescriptor(Map, "groupBy");
  originalObjectGroupBy = Object.getOwnPropertyDescriptor(Object, "groupBy");
  Reflect.deleteProperty(Map, "groupBy");
  Reflect.deleteProperty(Object, "groupBy");
});
afterEach(() => {
  cleanup();
  if (originalGroupBy) Object.defineProperty(Map, "groupBy", originalGroupBy);
  else Reflect.deleteProperty(Map, "groupBy");
  expect(Object.getOwnPropertyDescriptor(Map, "groupBy")).toEqual(originalGroupBy);
  if (originalObjectGroupBy) Object.defineProperty(Object, "groupBy", originalObjectGroupBy);
  else Reflect.deleteProperty(Object, "groupBy");
  expect(Object.getOwnPropertyDescriptor(Object, "groupBy")).toEqual(originalObjectGroupBy);
});

function show(locale: "ko" | "en" = "ko", overrides: Partial<InputProps> = {}) {
  const catalog = locale === "ko" ? ko : en;
  const fixture = intlFixture(catalog, locale);
  const props: InputProps = {
    name: "permissions",
    label: catalog.resources.roles.fields.permissions,
    kind: "enum-many",
    defaultValue: ["roles:read", "posts:manage"],
    options: (
      ["posts:manage", "roles:read", "posts:create", "users:read", "roles:manage"] as const
    ).map((value) => ({ value, label: catalog.resources.roles.enums.permissions[value] })),
    ...overrides,
  };
  render(
    <NextIntlClientProvider {...fixture}>
      <form aria-label="권한 폼">
        <ResourceInput {...props}>
          <PermissionPicker {...props} />
        </ResourceInput>
      </form>
    </NextIntlClientProvider>,
  );
  return screen.getByRole("form", { name: "권한 폼" }) as HTMLFormElement;
}

it.each(["ko", "en"] as const)(
  "그룹화 API 없이 권한 선택기가 순서·번역·선택 제출을 유지한다: %s",
  async (locale) => {
    const form = show(locale);
    const picker = screen.getByRole("group", { name: locale === "ko" ? "권한" : "Permissions" });
    expect(picker.id).toBe("permissions");
    expect(
      within(picker)
        .getAllByRole("group")
        .map((group) => group.querySelector("legend")?.textContent),
    ).toEqual(["posts", "roles", "users"]);
    expect(
      [...screen.getByRole("group", { name: "posts" }).querySelectorAll("label")].map(
        (label) => label.htmlFor,
      ),
    ).toEqual(["permissions-posts:manage", "permissions-posts:create"]);
    expect(
      [...screen.getByRole("group", { name: "roles" }).querySelectorAll("label")].map(
        (label) => label.htmlFor,
      ),
    ).toEqual(["permissions-roles:read", "permissions-roles:manage"]);
    for (const label of picker.querySelectorAll("label"))
      expect(label.control?.id).toBe(label.htmlFor);
    const manage = screen.getByRole("checkbox", {
      name: locale === "ko" ? "전체 글 관리" : "Manage all posts",
    });
    const create = screen.getByRole("checkbox", {
      name: locale === "ko" ? "글 작성" : "Write posts",
    });
    const read = screen.getByRole("checkbox", {
      name: locale === "ko" ? "역할과 권한 조회" : "Read roles and permissions",
    });
    expect(manage.getAttribute("aria-checked")).toBe("true");
    expect(read.getAttribute("aria-checked")).toBe("true");
    expect(create.getAttribute("aria-checked")).toBe("false");
    expect(new FormData(form).getAll("permissions")).toEqual(["posts:manage", "roles:read"]);
    const user = userEvent.setup();
    await user.click(create);
    expect(new FormData(form).getAll("permissions")).toEqual([
      "posts:manage",
      "posts:create",
      "roles:read",
    ]);
    await user.click(manage);
    await user.click(create);
    await user.click(read);
    expect(new FormData(form).getAll("permissions")).toEqual([]);
    expect(new FormData(form).get("__present_permissions")).toBe("1");
  },
);

it("권한 그룹은 처음 본 순서를 유지한다", () => {
  const values = ["users:read", "posts:manage", "roles:manage", "posts:create"] as const;
  const form = show("ko", {
    defaultValue: ["users:read", "posts:manage"],
    options: values.map((value) => ({
      value,
      label: ko.resources.roles.enums.permissions[value],
    })),
  });
  const picker = screen.getByRole("group", { name: "권한" });
  expect(
    within(picker)
      .getAllByRole("group")
      .map((group) => group.querySelector("legend")?.textContent),
  ).toEqual(["users", "posts", "roles"]);
  expect(
    [...screen.getByRole("group", { name: "posts" }).querySelectorAll("label")].map(
      (label) => label.htmlFor,
    ),
  ).toEqual(["permissions-posts:manage", "permissions-posts:create"]);
  expect(new FormData(form).getAll("permissions")).toEqual(["users:read", "posts:manage"]);
});

it("빈 권한 옵션은 선택 없이 폼의 존재 표식을 유지한다", () => {
  const form = show("ko", { defaultValue: [], options: [] });
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(new FormData(form).getAll("permissions")).toEqual([]);
  expect(new FormData(form).get("__present_permissions")).toBe("1");
});

it("비활성 권한 선택기는 초기 선택을 유지하고 값과 존재 표식을 제출하지 않는다", async () => {
  const form = show("ko", { defaultValue: ["posts:create"], disabled: true });
  const picker = screen.getByRole("group", { name: "권한" });
  for (const group of within(picker).getAllByRole("group"))
    expect((group as HTMLFieldSetElement).disabled).toBe(true);
  const create = screen.getByRole("checkbox", { name: "글 작성" });
  await userEvent.setup().click(create);
  expect(create.getAttribute("aria-checked")).toBe("true");
  expect(new FormData(form).getAll("permissions")).toEqual([]);
  expect(new FormData(form).has("__present_permissions")).toBe(false);
});
