import { expect, it } from "vitest";
import { parseSessionsPage } from "./state";

it.each<[string | string[] | undefined, number]>([
  ["2147483647", 2147483647],
  ["2147483648", 1],
  ["0", 1],
  ["-1", 1],
  ["abc", 1],
  [undefined, 1],
  [["abc", "2"], 1],
  [["2", "abc"], 2],
  ["1.5", 1],
  ["9007199254740992", 1],
])("세션 페이지 %j를 %i로 해석한다", (input, expected) => {
  expect(parseSessionsPage(input)).toBe(expected);
});
