import { expect, it } from "vitest";
import { visibleResources, findScreen, controlsFor } from "./access";
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
it("동작·수정·삭제는 각 권한과 현재 레코드 조건을 적용한다", () => {
  const resource = {
    ...postsFixture,
    actions: [
      {
        name: "publish",
        permission: "posts:manage" as const,
        action: async () => ({ ok: true as const }),
        visible: (post: { attributes: { status: string } }) => post.attributes.status === "draft",
      },
    ],
  };
  const record = { type: "posts", id: "1", attributes: { status: "published" } };
  expect(controlsFor(resource, [], record)).toEqual({ edit: false, delete: false, actions: [] });
  expect(controlsFor(resource, ["posts:manage"], record)).toEqual({
    edit: true,
    delete: true,
    actions: [],
  });
  expect(
    controlsFor(resource, ["posts:manage"], { ...record, attributes: { status: "draft" } }).actions,
  ).toHaveLength(1);
});
it("수정·삭제의 레코드 조건도 버튼을 감춘다", () => {
  const resource = {
    ...postsFixture,
    edit: { ...postsFixture.edit!, visible: () => false },
    delete: { permission: "posts:manage" as const, visible: () => false },
  };
  expect(
    controlsFor(resource, ["posts:manage"], { type: "posts", id: "1", attributes: {} }),
  ).toMatchObject({ edit: false, delete: false });
});
