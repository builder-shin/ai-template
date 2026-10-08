import { expect, it } from "vitest";
import { resourceMessageKeys, missingResourceMessages } from "./messages";
import { postsFixture } from "../../../scripts/test/resource-fixture";
it("등록 선언의 제목·필드·필터·열거값·동작을 빠짐없이 모은다", () => {
  const resource = {
    ...postsFixture,
    fields: { status: { kind: "enum" as const, values: ["draft", "published"] } },
    actions: [
      {
        name: "publish",
        permission: "posts:manage" as const,
        action: async () => ({ ok: true as const }),
      },
    ],
  };
  const keys = resourceMessageKeys([resource]);
  for (const key of [
    "title",
    "fields.title",
    "fields.q",
    "fields.status",
    "fields.author",
    "enums.status.draft",
    "actions.publish",
  ])
    expect(keys).toContain(`resources.posts.${key}`);
  const errors = missingResourceMessages([resource], {
    ko: { resources: { posts: { title: "글" } } },
    en: {},
  });
  expect(errors).toContain("en: resources.posts.title — 메시지 키를 추가한다.");
  expect(errors).toContain("ko: resources.posts.enums.status.published — 메시지 키를 추가한다.");
});
it("열거값을 쓰는 선언에 값 목록이 없으면 검사를 거절한다", () => {
  expect(missingResourceMessages([postsFixture], { ko: {}, en: {} })).toContain(
    "posts.status: 열거값 목록 없음 — fields의 values를 선언한다.",
  );
});
