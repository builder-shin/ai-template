import { expect, it } from "vitest";
import { passwordBytes } from "../encoding.js";

it.each([
  ["a\uD800b", "61eda08062"],
  ["a\uFFFDb", "61efbfbd62"],
  ["😀", "f09f9880"],
  ["\uDC00\uD800", "edb080eda080"],
  ["\u0000é한", "00c3a9ed959c"],
  ["", ""],
])("비밀번호 바이트는 surrogatepass UTF-8을 보존한다: %j", (password, hex) => {
  expect(passwordBytes(password).toString("hex")).toBe(hex);
});
