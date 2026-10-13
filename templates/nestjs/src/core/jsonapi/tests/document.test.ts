import { expect, it } from "vitest";
import { collectionDocument, paginationLinks, resourceObject } from "../document.js";
import { IncludeRegistry } from "../include.js";
import type { Tx } from "../../db/unit-of-work.js";
import type { Principal } from "../../security/principal.js";
it("페이지 링크는 번호를 맨 뒤에 붙인 상대 경로다", () => {
  expect(
    paginationLinks("/api/v1/posts", "page[number]=2&page[size]=10", { number: 2, size: 10 }, 35),
  ).toEqual({
    first: "/api/v1/posts?page%5Bsize%5D=10&page%5Bnumber%5D=1",
    prev: "/api/v1/posts?page%5Bsize%5D=10&page%5Bnumber%5D=1",
    next: "/api/v1/posts?page%5Bsize%5D=10&page%5Bnumber%5D=3",
    last: "/api/v1/posts?page%5Bsize%5D=10&page%5Bnumber%5D=4",
  });
});
it("검색어 인코딩과 파라미터 순서를 보존한다", () => {
  expect(
    paginationLinks(
      "/api/v1/users",
      "filter[q]=kim+lee&page[size]=10&page[number]=2",
      { number: 2, size: 10 },
      35,
    ).next,
  ).toBe("/api/v1/users?filter%5Bq%5D=kim+lee&page%5Bsize%5D=10&page%5Bnumber%5D=3");
});
it("빈 결과의 totalPages는 0이고 이전과 다음 링크는 없다", () => {
  expect(
    collectionDocument([], {
      total: 0,
      page: { number: 1, size: 20 },
      path: "/api/v1/posts",
      search: "",
    }),
  ).toEqual({
    data: [],
    meta: { page: { number: 1, size: 20, total: 0, totalPages: 0 } },
    links: {
      first: "/api/v1/posts?page%5Bnumber%5D=1",
      prev: null,
      next: null,
      last: "/api/v1/posts?page%5Bnumber%5D=1",
    },
  });
});
it("컬렉션은 리소스와 포함 리소스를 문서에 담는다", () => {
  const post = resourceObject(
    "posts",
    "p1",
    { title: "글" },
    { author: { data: { type: "users", id: "u1" } } },
  );
  const user = resourceObject("users", "u1", { name: "사람" });
  expect(
    collectionDocument([post], {
      included: [user],
      total: 1,
      page: { number: 1, size: 20 },
      path: "/api/v1/posts",
      search: "",
    }),
  ).toMatchObject({
    data: [
      {
        type: "posts",
        id: "p1",
        attributes: { title: "글" },
        relationships: { author: { data: { type: "users", id: "u1" } } },
      },
    ],
    included: [{ type: "users", id: "u1", attributes: { name: "사람" } }],
  });
});
it("include는 중복 id를 묶고 중첩 관계를 따라가며 주 리소스를 제외한다", async () => {
  const registry = new IncludeRegistry();
  const tx = {} as Tx;
  const viewer: Principal = {
    userId: "u1",
    sessionId: "s1",
    permissions: new Set(["users:manage"]),
  };
  const calls: unknown[] = [];
  registry.register("users", (actualTx, ids, actualViewer) => {
    calls.push([actualTx === tx, ids, actualViewer === viewer]);
    return Promise.resolve([
      {
        type: "users",
        id: "u1",
        attributes: { name: "이름", email: "private@example.com" },
        relationships: { avatar: { data: { type: "files", id: "f1" } }, roles: { data: [] } },
      },
    ]);
  });
  registry.register("files", (_tx, ids) => {
    calls.push(ids);
    return Promise.resolve([resourceObject("files", "f1", { name: "이미지" })]);
  });
  const primary = ["p1", "p2"].map((id) =>
    resourceObject("posts", id, {}, { author: { data: { type: "users", id: "u1" } } }),
  );
  expect(
    await registry.load(tx, ["author", "author.avatar", "author.avatar"], primary, viewer),
  ).toEqual([
    {
      type: "users",
      id: "u1",
      attributes: { name: "이름" },
      relationships: { avatar: { data: { type: "files", id: "f1" } } },
    },
    { type: "files", id: "f1", attributes: { name: "이미지" } },
  ]);
  expect(calls).toEqual([[true, ["u1"], true], ["f1"]]);
});
it("include는 배열·null 관계와 순환을 다루며 무관한 로더 결과를 버린다", async () => {
  const registry = new IncludeRegistry();
  const calls: unknown[] = [];
  registry.register("posts", (_tx, ids) => {
    calls.push(["posts", ids]);
    return Promise.resolve(
      ids.includes("p2")
        ? [
            resourceObject(
              "posts",
              "p2",
              {},
              {
                related: {
                  data: [
                    { type: "posts", id: "p1" },
                    { type: "posts", id: "p2" },
                    { type: "posts", id: "stray" },
                  ],
                },
                file: { data: { type: "files", id: "p2" } },
              },
            ),
            resourceObject("posts", "stray", {}),
            resourceObject("files", "p2", {}),
          ]
        : [],
    );
  });
  registry.register("files", (_tx, ids) => {
    calls.push(["files", ids]);
    return Promise.resolve([]);
  });
  const primary = [
    resourceObject(
      "posts",
      "p1",
      {},
      {
        related: {
          data: [
            { type: "posts", id: "p1" },
            { type: "posts", id: "p2" },
          ],
        },
        missing: { data: null },
      },
    ),
  ];
  const included = await registry.load(
    {} as Tx,
    ["related.related", "related.file", "missing"],
    primary,
    undefined,
  );
  expect(included.map(({ type, id }) => ({ type, id }))).toEqual([{ type: "posts", id: "p2" }]);
  expect(calls).toEqual([
    ["posts", ["p2"]],
    ["posts", ["stray"]],
    ["files", ["p2"]],
  ]);
});
it("include 로더 중복 등록을 거절한다", () => {
  const registry = new IncludeRegistry();
  registry.register("posts", () => Promise.resolve([]));
  expect(() => {
    registry.register("posts", () => Promise.resolve([]));
  }).toThrow();
});
