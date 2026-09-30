/**
 * 시간대가 있는 시각 읽기(Pydantic의 AwareDatetime, lax 모드). 기대값은 FastAPI 템플릿이 쓰는 Pydantic
 * 2.13(pydantic-core 2.46, speedate 0.17)으로 확인했다.
 */

import { describe, expect, it } from "vitest";
import { formatInstant } from "../src/core/clock.ts";
import { parseAwareDatetime } from "../src/jsonapi/datetime-input.ts";

function read(raw: string): string {
  const result = parseAwareDatetime(raw);
  return "value" in result ? formatInstant(result.value) : result.problem;
}

describe("RFC 3339", () => {
  it.each([
    ["2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"],
    ["2026-09-30T12:34:56.789012+09:00", "2026-09-30T03:34:56.789012Z"],
    ["2026-01-01t00:00:00z", "2026-01-01T00:00:00Z"],
    ["2026-01-01_00:00:00Z", "2026-01-01T00:00:00Z"],
    ["2026-01-01 00:00Z", "2026-01-01T00:00:00Z"],
    ["2026-01-01T00:00:00+0900", "2025-12-31T15:00:00Z"],
    ["2026-01-01T00:00:00−09:00", "2026-01-01T09:00:00Z"],
    ["2026-01-01T00:00:00,5Z", "2026-01-01T00:00:00.500000Z"],
    ["2026-01-01T00:00:00.1234567Z", "2026-01-01T00:00:00.123456Z"],
    ["2024-02-29T23:59:59.999999-23:59", "2024-03-01T23:58:59.999999Z"],
  ])("%s는 %s다", (raw, expected) => {
    expect(read(raw)).toBe(expected);
  });
});

describe("Unix 시각", () => {
  it.each([
    ["1700000000", "2023-11-14T22:13:20Z"],
    ["+1700000000", "2023-11-14T22:13:20Z"],
    ["1700000000123", "2023-11-14T22:13:20.123000Z"],
    ["1700000000.5", "2023-11-14T22:13:20.500000Z"],
    ["-12.5", "1969-12-31T23:59:47.500000Z"],
    ["1.5e3", "1970-01-01T00:25:00Z"],
    ["20000000000", "2603-10-11T11:33:20Z"],
    ["20000000001", "1970-08-20T11:33:20.001000Z"],
    // speedate는 실수의 밀리초를 초로 바꾼 뒤 한 번 더 밀리초로 본다.
    ["253402300799999.5", "1978-01-11T21:31:41.798512Z"],
  ])("%s는 %s다", (raw, expected) => {
    expect(read(raw)).toBe(expected);
  });
});

describe("틀린 값", () => {
  const invalid = (problem: string) => `Input should be a valid datetime or date, ${problem}`;

  it.each([
    ["2026-01-01T00:00:00", "Input should have timezone info"],
    ["2026-01-01", "Input should have timezone info"],
    ["", invalid("input is too short")],
    ["2e10", invalid("input is too short")],
    ["2026-13-01T00:00:00Z", invalid("month value is outside expected range of 1-12")],
    ["2023-02-29T00:00:00Z", invalid("day value is outside expected range")],
    ["2026-01-01T24:00:00Z", invalid("unexpected extra characters at the end of the input")],
    ["2026-01-01T00:00:00+09", invalid("unexpected extra characters at the end of the input")],
    [" 1700000000", invalid("invalid character in year")],
    ["1700000000 ", invalid("invalid date separator, expected `-`")],
    ["٢٠٢٦-01-01T00:00:00Z", invalid("invalid character in year")],
    ["-62167219200001", invalid("dates before 0000 are not supported as unix timestamps")],
    ["253402300800000", invalid("dates after 9999 are not supported as unix timestamps")],
    ["9223372036854775808", invalid("invalid date separator, expected `-`")],
    // speedate는 i64로 넘친 정수가 양수로 돌아오면 그대로 쓴다.
    ["19833883338632104484", invalid("dates after 9999 are not supported as unix timestamps")],
    ["0000-12-31T23:00:00-01:00", "Input should be a valid datetime, year 0 is out of range"],
  ])("%j는 %s다", (raw, problem) => {
    expect(read(raw)).toBe(problem);
  });
});
