import { expect, it } from "vitest";
import { visibleResources, findScreen } from "./access";
import { postsFixture } from "../../../scripts/test/resource-fixture";
import { defineResource } from "./definition";

it("등록 순서에서 권한 있는 리소스만 메뉴와 첫 화면 후보에 남긴다", () => {
  const roles = defineResource({
    type: "roles",
    permission: "roles:read",
    list: { columns: ["name"] },
  });
  expect(visibleResources([roles, postsFixture], ["posts:manage"])).toEqual([postsFixture]);
  expect(visibleResources([roles, postsFixture], [])).toEqual([]);
});
it("미등록·없는 상세·없는 쓰기 화면은 찾지 못한다", () => {
  const readonly = defineResource({
    type: "permissions",
    permission: "roles:read",
    list: { columns: ["group"] },
  });
  expect(findScreen([readonly], "unknown", "list")).toBeUndefined();
  expect(findScreen([readonly], "permissions", "detail")).toBeUndefined();
  expect(findScreen([readonly], "permissions", "create")).toBeUndefined();
  expect(findScreen([postsFixture], "posts", "edit")).toBe(postsFixture);
});
