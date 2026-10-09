import { expect, it } from "vitest";
import { postsFixture } from "../../../scripts/test/resource-fixture";
import { defineResource } from "./definition";
import { resourceQuery } from "./query";

it("선언한 필터·정렬만 전달하고 페이지 크기는 20으로 고정한다", () => {
  expect(
    resourceQuery(postsFixture, {
      "filter[q]": "찾기",
      "filter[status]": "draft",
      "filter[unknown]": "secret",
      sort: "title,-createdAt",
      "page[number]": "2",
      "page[size]": "99",
      include: "coverImage",
    }),
  ).toEqual({
    "filter[q]": "찾기",
    "filter[status]": "draft",
    sort: "title,-createdAt",
    "page[number]": 2,
    "page[size]": 20,
    include: "author",
  });
});

it.each(["0", "-1", "1.5", "1e2", "Infinity", "9007199254740992", ["2", "3"]])(
  "잘못되거나 중복된 페이지는 첫 페이지로 돌린다: %s",
  (page) => {
    expect(resourceQuery(postsFixture, { "page[number]": page })).toMatchObject({
      "page[number]": 1,
      "page[size]": 20,
      sort: "-createdAt",
    });
  },
);

it("허용하지 않은 정렬과 중복 필터는 기본값으로 돌린다", () => {
  expect(
    resourceQuery(postsFixture, {
      sort: "title,-body",
      "filter[q]": ["one", "two"],
      "filter[status]": "",
    }),
  ).toEqual({ "page[number]": 1, "page[size]": 20, sort: "-createdAt", include: "author" });
});

it("기간 필터는 설정 시간대의 날짜 경계로 API에 보낸다", () => {
  const resource = defineResource({
    type: "audit-logs",
    permission: "audit-logs:read",
    list: {
      columns: ["action"],
      filters: { "filter[createdFrom]": "date", "filter[createdTo]": "date" },
    },
  });
  expect(
    resourceQuery(resource, {
      "filter[createdFrom]": "2026-10-08",
      "filter[createdTo]": "2026-10-08",
    }),
  ).toMatchObject({
    "filter[createdFrom]": "2026-10-07T15:00:00.000Z",
    "filter[createdTo]": "2026-10-08T15:00:00.000Z",
  });
});
