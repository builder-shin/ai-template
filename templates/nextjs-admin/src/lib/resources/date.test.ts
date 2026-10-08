import { expect, it } from "vitest";
import { calendarDateFilter } from "./date";
it("기간 시작과 끝을 설정 시간대의 하루 경계로 바꾼다", () => {
  expect(calendarDateFilter("2026-10-08", false, "Asia/Seoul")).toBe("2026-10-07T15:00:00.000Z");
  expect(calendarDateFilter("2026-10-08", true, "Asia/Seoul")).toBe("2026-10-08T14:59:59.999Z");
});
it("서머타임이 바뀌는 하루는 다음 날의 경계에서 끝난다", () => {
  expect(calendarDateFilter("2026-03-08", false, "America/New_York")).toBe(
    "2026-03-08T05:00:00.000Z",
  );
  expect(calendarDateFilter("2026-03-08", true, "America/New_York")).toBe(
    "2026-03-09T03:59:59.999Z",
  );
});
it("잘못된 날짜와 기존 ISO 값은 API 검증을 위해 그대로 둔다", () => {
  expect(calendarDateFilter("2026-02-31", false, "UTC")).toBe("2026-02-31");
  expect(calendarDateFilter("2026-10-08T00:00:00Z", false, "UTC")).toBe("2026-10-08T00:00:00Z");
});
