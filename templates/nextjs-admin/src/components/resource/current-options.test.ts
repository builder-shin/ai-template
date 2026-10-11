import { expect, it } from "vitest";
import { withCurrentOptions } from "./current-options";

const relation = { type: "users", label: "name" };
const options = [{ value: "a", label: "기본 이름" }];
const included = [
  { type: "roles", id: "b", attributes: { name: "다른 대상" } },
  { type: "users", id: "b", attributes: { name: "포함한 이름" } },
];
it("옵션 밖 현재 값은 같은 대상의 included 라벨이나 id로 더한다", () => {
  expect(withCurrentOptions(options, ["a", "b", "c", "b"], relation, included)).toEqual([
    { value: "a", label: "기본 이름" },
    { value: "b", label: "포함한 이름" },
    { value: "c", label: "c" },
  ]);
  expect(options).toEqual([{ value: "a", label: "기본 이름" }]);
});
it("단일 현재 값과 폼의 관계 라벨 없는 현재 값도 보존한다", () => {
  expect(withCurrentOptions([], "b", relation, included)).toEqual([
    { value: "b", label: "포함한 이름" },
  ]);
  expect(withCurrentOptions([], "b")).toEqual([{ value: "b", label: "b" }]);
});
it.each([
  { name: "null", value: null },
  { name: "undefined", value: undefined },
  { name: "빈 문자열", value: "" },
  { name: "숫자", value: 12 },
  { name: "문자열 없는 배열", value: [null, 12] },
])("없는 값·문자열 아닌 값은 더하지 않는다: $name", ({ value }) => {
  expect(withCurrentOptions(options, value, relation, included)).toEqual(options);
});
