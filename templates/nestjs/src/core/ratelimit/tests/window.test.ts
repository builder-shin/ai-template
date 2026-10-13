import { expect, it } from "vitest";
import { hitWindow } from "../window.js";
import { store } from "./fixtures.js";
it.each([
  [1, true],
  [10, true],
  [11, false],
])("한도 10에서 카운터 %i의 허용 여부를 반환한다", async (count, allowed) => {
  const { redis, evalCommand } = store([count, 42]);
  expect(await hitWindow(redis, "aitpl:15:rl:fixture", 10, 60)).toEqual({
    allowed,
    count,
    retryAfter: 42,
  });
  expect(evalCommand).toHaveBeenCalledExactlyOnceWith(
    expect.any(String),
    1,
    "aitpl:15:rl:fixture",
    60,
  );
});
it("TTL이 0이면 다시 시도할 최소 1초를 반환한다", async () => {
  expect(await hitWindow(store([11, 0]).redis, "fixture", 10, 60)).toEqual({
    allowed: false,
    count: 11,
    retryAfter: 1,
  });
});
it("저장소 오류는 호출자에게 전달한다", async () => {
  const { redis, evalCommand } = store();
  evalCommand.mockRejectedValue(new Error("연결 종료"));
  await expect(hitWindow(redis, "fixture", 10, 60)).rejects.toThrow("연결 종료");
});
