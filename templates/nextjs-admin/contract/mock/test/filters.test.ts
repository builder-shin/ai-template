/**
 * filter[...] 파서: FastAPI의 필터 모델(Pydantic, lax 모드)이 받는 값을 받고 같은 메시지를 내는지 본다.
 * 기대값은 FastAPI 템플릿이 쓰는 Pydantic 2.13(pydantic-core 2.46)으로 확인했다.
 */

import { describe, expect, it } from "vitest";
import { enumFilter, textFilter, uuidFilter } from "../src/jsonapi/filters.ts";
import type { FilterParser } from "../src/jsonapi/query.ts";

function outcome<T>(parse: FilterParser<T>, raw: string): T | string {
  const result = parse(raw);
  return "value" in result ? result.value : result.problem;
}

describe("문자열", () => {
  it("무엇이든 그대로 받는다", () => {
    expect(["", " a b ", "100%"].map((raw) => outcome(textFilter, raw))).toEqual([
      "",
      " a b ",
      "100%",
    ]);
  });
});

describe("enum", () => {
  it("계약의 값과 정확히 같아야 하고, 선택지는 계약에 적힌 순서다", () => {
    const status = enumFilter("UserStatus");
    expect(outcome(status, "deactivated")).toBe("deactivated");
    for (const raw of ["Active", " active", ""]) {
      expect(outcome(status, raw)).toBe("Input should be 'active', 'deactivated' or 'deleted'");
    }
    expect(outcome(enumFilter("AuditLogTargetType"), "files")).toBe(
      "Input should be 'users', 'roles' or 'posts'",
    );
  });
});

describe("UUID", () => {
  it.each([
    ["01920000-0000-7000-8000-000000000000", "01920000-0000-7000-8000-000000000000"],
    ["01920000000070008000000000000000", "01920000-0000-7000-8000-000000000000"],
    ["{ABCDEF00-0000-7000-8000-000000000000}", "abcdef00-0000-7000-8000-000000000000"],
    ["urn:uuid:01920000-0000-7000-8000-000000000000", "01920000-0000-7000-8000-000000000000"],
  ])("Pydantic처럼 %s를 받는다", (raw, expected) => {
    expect(outcome(uuidFilter, raw)).toBe(expected);
  });

  it.each([
    ["admin", "invalid character: found `m` at 3"],
    ["", "invalid length: expected length 32 for simple format, found 0"],
    [
      "0192000000007000800000000000000",
      "invalid length: expected length 32 for simple format, found 31",
    ],
    [
      "01920000-0000-7000-8000-00000000000",
      "invalid group length in group 4: expected 12, found 11",
    ],
    [
      "0192000-00000-7000-8000-000000000000",
      "invalid group length in group 0: expected 8, found 7",
    ],
    ["0192-0000-0000-7000-8000-000000000000", "invalid group count: expected 5, found 6"],
    ["----", "invalid group length in group 0: expected 8, found 0"],
    ["{}", "invalid group count: expected 5, found 1"],
    ["{", "invalid character: found `{` at 1"],
    ["urn:uuid:xyz", "invalid character: found `x` at 10"],
    ["URN:UUID:01920000-0000-7000-8000-000000000000", "invalid character: found `U` at 1"],
    [
      "{01920000-0000-7000-8000-0000000000000}",
      "invalid group length in group 4: expected 12, found 15",
    ],
    [
      "urn:uuid:01920000-0000-7000-8000-0000000000000",
      "invalid group length in group 4: expected 12, found 22",
    ],
    // 딱 38바이트인 {…}와 45바이트인 urn:uuid:…는 본문 안의 자리로 센다.
    ["{01920000-0000-7000-8000-00000000000g}", "invalid character: found `g` at 36"],
    ["urn:uuid:01 900b2-8c3e-7abc-8def-0123456789ab", "invalid character: found ` ` at 3"],
    [
      "urn:uuid:01920000000070008000000000000000abcd",
      "invalid length: expected length 32 for simple format, found 36",
    ],
    ["01920000-0000-7000-8000-00000000000é", "invalid character: found `é` at 36"],
  ])("%j는 uuid 크레이트의 설명을 붙인다", (raw, problem) => {
    expect(outcome(uuidFilter, raw)).toBe(`Input should be a valid UUID, ${problem}`);
  });
});
