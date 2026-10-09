import { expect, it } from "vitest";
import { rolesFixture } from "../../../scripts/test/resource-fixture";
import { parseResourceForm, fieldValue } from "./values";
import { buildResourceDocument } from "./document";
import type { WriteValues } from "./contract";
import { missingResourceMessages, resourceMessageKeys } from "./messages";

it("다중 열거값은 모든 선택을 속성 배열로 보내고 빈 선택·미제출을 구분한다", () => {
  const form = new FormData();
  expect(parseResourceForm(rolesFixture, "edit", form).values).toEqual({});
  form.set("__present_permissions", "1");
  expect(parseResourceForm(rolesFixture, "edit", form)).toEqual({
    values: { permissions: [] },
    inputs: { permissions: [] },
  });
  form.append("permissions", "posts:create");
  form.append("permissions", "posts:manage");
  const parsed = parseResourceForm(rolesFixture, "edit", form);
  expect(parsed).toEqual({
    values: { permissions: ["posts:create", "posts:manage"] },
    inputs: { permissions: ["posts:create", "posts:manage"] },
  });
  expect(
    buildResourceDocument(rolesFixture, "edit", parsed.values as WriteValues<"roles", "edit">, "r"),
  ).toEqual({
    data: { type: "roles", id: "r", attributes: { permissions: ["posts:create", "posts:manage"] } },
  });
});
it("id 표시는 attributes 대신 리소스 식별자를 읽는다", () => {
  expect(fieldValue({ type: "roles", id: "r", attributes: { name: "역할" } }, "id")).toBe("r");
});
it("다중 열거값의 값 목록과 번역 누락을 검사한다", () => {
  expect(resourceMessageKeys([rolesFixture])).toContain(
    "resources.roles.enums.permissions.posts:manage",
  );
  expect(missingResourceMessages([rolesFixture], { ko: {} })).toContain(
    "ko: resources.roles.enums.permissions.posts:create — 메시지 키를 추가한다.",
  );
  expect(
    missingResourceMessages(
      [{ ...rolesFixture, fields: { permissions: { kind: "enum-many" } } }],
      {},
    ),
  ).toContain("roles.permissions: 열거값 목록 없음 — fields의 values를 선언한다.");
});
