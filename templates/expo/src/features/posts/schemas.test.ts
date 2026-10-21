import { postSchema } from "./schemas";
import { postKeys, authorLabel } from "./queries";
import type { PostDocument } from "./api";
test("post validation enforces the contract without trimming body content", () => {
  expect(postSchema.safeParse({ title: "", body: "", status: "draft" }).success).toBe(false);
  expect(postSchema.safeParse({ title: "x".repeat(201), body: "", status: "draft" }).success).toBe(
    false,
  );
  expect(
    postSchema.safeParse({ title: "ok", body: "x".repeat(100001), status: "draft" }).success,
  ).toBe(false);
  expect(postSchema.parse({ title: "ok", body: "  markdown\n", status: "published" }).body).toBe(
    "  markdown\n",
  );
});
test("every post result is partitioned by generation, locale, filters and page", () => {
  const scope = { generation: 1, locale: "ko" as const, page: 1 };
  const keys = [
    postKeys.list(scope),
    postKeys.list({ ...scope, generation: 2 }),
    postKeys.list({ ...scope, locale: "en" }),
    postKeys.list({ ...scope, page: 2 }),
    postKeys.list({ ...scope, author: "other" }),
  ];
  expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
});
test("author labels resolve the relationship id, with a translated null fallback", () => {
  const document = {
    data: { relationships: { author: { data: { type: "users", id: "author" } } } },
    included: [
      { type: "users", id: "unrelated", attributes: { name: "Unrelated" } },
      { type: "users", id: "author", attributes: { name: "Author" } },
    ],
  } as PostDocument;
  expect(authorLabel(document.data, document.included, "Unknown")).toBe("Author");
  expect(authorLabel(document.data, undefined, "알 수 없는 작성자")).toBe("알 수 없는 작성자");
});
