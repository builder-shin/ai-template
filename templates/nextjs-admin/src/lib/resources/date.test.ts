import { expect, it } from "vitest";
import { calendarDateFilter, filterCalendarDate } from "./date";
it("기간 시작과 끝을 설정 시간대의 하루 경계로 바꾼다", () => {
  expect(calendarDateFilter("2026-10-08", false, "Asia/Seoul")).toBe("2026-10-07T15:00:00.000Z");
  expect(calendarDateFilter("2026-10-08", true, "Asia/Seoul")).toBe("2026-10-08T15:00:00.000Z");
});
it("서머타임이 바뀌는 하루는 다음 날의 경계에서 끝난다", () => {
  expect(calendarDateFilter("2026-03-08", false, "America/New_York")).toBe(
    "2026-03-08T05:00:00.000Z",
  );
  expect(calendarDateFilter("2026-03-08", true, "America/New_York")).toBe(
    "2026-03-09T04:00:00.000Z",
  );
});
it("배타적인 끝 경계 바로 전 시각까지 포함하고 다음 날은 제외한다", () => {
  const end = Date.parse(calendarDateFilter("2026-10-08", true, "Asia/Seoul"));
  expect(Date.parse("2026-10-08T14:59:59.999Z") < end).toBe(true);
  expect(Date.parse("2026-10-08T15:00:00.000Z") < end).toBe(false);
  expect(calendarDateFilter("2026-11-01", true, "America/New_York")).toBe(
    "2026-11-02T05:00:00.000Z",
  );
});
it("ISO 필터를 같은 시간대의 선택 날짜로 되돌린다", () => {
  expect(filterCalendarDate("2026-10-07T15:00:00.000Z", false, "Asia/Seoul")).toBe("2026-10-08");
  expect(filterCalendarDate("2026-10-08T15:00:00.000Z", true, "Asia/Seoul")).toBe("2026-10-08");
  expect(filterCalendarDate("2026-03-09T04:00:00.000Z", true, "America/New_York")).toBe(
    "2026-03-08",
  );
  expect(filterCalendarDate("2026-10-08", true, "Asia/Seoul")).toBe("2026-10-08");
  expect(filterCalendarDate("잘못된 값", false, "UTC")).toBe("잘못된 값");
});
it("잘못된 날짜와 기존 ISO 값은 API 검증을 위해 그대로 둔다", () => {
  expect(calendarDateFilter("2026-02-31", false, "UTC")).toBe("2026-02-31");
  expect(calendarDateFilter("2026-10-08T00:00:00Z", false, "UTC")).toBe("2026-10-08T00:00:00Z");
});
