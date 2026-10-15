import { expect, it } from "vitest";
import { postCreateDocumentSchema, postUpdateDocumentSchema } from "../index.js";
it.each([
  { label: "빈 제목", attributes: { title: "", body: "" } },
  { label: "긴 제목", attributes: { title: "🐋".repeat(201), body: "" } },
  { label: "긴 본문", attributes: { title: "글", body: "🐋".repeat(100001) } },
  { label: "잘못된 상태", attributes: { title: "글", body: "", status: "archived" } },
  { label: "잘못된 유니코드", attributes: { title: "글", body: "\ud800" } },
])("$label 생성 문서는 거절한다", ({ attributes }) => {
  expect(postCreateDocumentSchema.safeParse({ data: { type: "posts", attributes } }).success).toBe(
    false,
  );
});
it("100000 코드 포인트 본문과 빈 본문은 허용한다", () => {
  for (const body of ["", "🐋".repeat(100000)])
    expect(
      postCreateDocumentSchema.safeParse({
        data: { type: "posts", attributes: { title: "글", body } },
      }).success,
    ).toBe(true);
});
it("PATCH는 타입과 id를 요구하고 희소 속성을 허용한다", () => {
  expect(postUpdateDocumentSchema.safeParse({ data: { type: "posts" } }).success).toBe(false);
  expect(
    postUpdateDocumentSchema.safeParse({
      data: { type: "posts", id: "id", attributes: { title: "수정" } },
    }).success,
  ).toBe(true);
});
