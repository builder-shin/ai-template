import { expect, it } from "vitest";
import { nextStatus, publicationTime } from "../index.js";
import type { PostStatus } from "../index.js";
for (const { from, to } of [
  { from: "draft", to: "published" },
  { from: "published", to: "draft" },
  { from: "draft", to: "draft" },
  { from: "published", to: "published" },
] as const)
  it(`${from}에서 ${to} 전이를 허용한다`, () => {
    expect(nextStatus(from, to)).toBe(to);
  });
it.each(["archived", "", null])("정의 밖 상태 %s는 전이 오류다", (invalid) => {
  expect(() => nextStatus("draft", invalid as PostStatus)).toThrow(
    expect.objectContaining({
      init: expect.objectContaining({ status: 422, code: "post.invalid_transition" }) as unknown,
    }),
  );
});
const at = new Date("2026-10-15T00:00:00Z"),
  previous = new Date("2026-10-14T00:00:00Z");
it("발행 시각을 기록한다", () => {
  expect(publicationTime("draft", "published", null, at)).toEqual(at);
});
it("발행을 취소하면 시각을 비운다", () => {
  expect(publicationTime("published", "draft", previous, at)).toBeNull();
});
it("같은 발행 상태 요청은 기존 시각을 보존한다", () => {
  expect(publicationTime("published", "published", previous, at)).toEqual(previous);
});
