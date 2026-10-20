import { expect, it } from "vitest";
import { parseResourceForm } from "./values";
import { postsFixture } from "../../../scripts/test/resource-fixture";
import { defineResource } from "./definition";
it("관계는 서버의 type으로 만들고 비운 다중 관계·false도 보존한다", () => {
  const resource = defineResource({
    type: "users",
    permission: "users:manage",
    list: { columns: ["name"] },
    fields: { roles: { relation: { type: "roles", label: "name" } } },
    edit: { permission: "users:manage", fields: { roles: "relation-many" } },
  });
  const form = new FormData();
  form.set("__present_roles", "1");
  expect(parseResourceForm(resource, "edit", form).values).toEqual({ roles: [] });
  form.append("roles", "a");
  form.append("roles", "b");
  expect(parseResourceForm(resource, "edit", form).values).toEqual({
    roles: [
      { type: "roles", id: "a" },
      { type: "roles", id: "b" },
    ],
  });
});
it("미제출·미선언 필드는 보내지 않으며 관계 type은 필수다", () => {
  const form = new FormData();
  form.set("body", "본문");
  expect(parseResourceForm(postsFixture, "edit", form).values).toEqual({});
  form.set("coverImage", "x");
  expect(() => parseResourceForm(postsFixture, "edit", form)).toThrow("관계 대상 선언 없음");
});

it("명시한 nullable 텍스트만 null로 바꾸고 실패 입력과 다른 빈 문자열은 보존한다", () => {
  const resource = defineResource({
    type: "roles",
    permission: "roles:manage",
    list: { columns: ["name"] },
    fields: { description: { kind: "textarea", emptyToNull: true } },
    edit: { permission: "roles:manage", fields: { name: "text", description: "textarea" } },
  });
  const form = new FormData();
  form.set("name", "");
  form.set("description", "");
  expect(parseResourceForm(resource, "edit", form)).toEqual({
    values: { name: "", description: null },
    inputs: { name: "", description: "" },
  });
});
