// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useChannel } from "../../lib/realtime";
import { ResourceRealtime } from "./realtime";
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
const refresh = router.refresh;
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("../../lib/realtime", () => ({ useChannel: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
function event(id = "1") {
  act(() =>
    vi
      .mocked(useChannel)
      .mock.calls.at(-1)![1]({
        name: "post.deleted",
        payload: { data: { type: "posts", id } },
      }),
  );
}
function visibility(value: DocumentVisibilityState) {
  vi.mocked(Object.getOwnPropertyDescriptor(document, "visibilityState")!.get!).mockReturnValue(
    value,
  );
  act(() => document.dispatchEvent(new Event("visibilitychange")));
}
it("창 중간의 이벤트도 첫 이벤트부터 1000ms 뒤 한 번의 갱신으로 묶는다", () => {
  render(<ResourceRealtime channel="posts:all" />);
  expect(useChannel).toHaveBeenCalledWith("posts:all", expect.any(Function));
  event();
  act(() => vi.advanceTimersByTime(500));
  event();
  act(() => vi.advanceTimersByTime(499));
  expect(refresh).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(refresh).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(500));
  expect(refresh).toHaveBeenCalledTimes(1);
  event();
  act(() => vi.advanceTimersByTime(1000));
  expect(refresh).toHaveBeenCalledTimes(2);
});
it("레코드·선언 채널 변경과 unmount는 이전 갱신 예약을 취소한다", () => {
  const result = render(<ResourceRealtime channel="posts:all" id="1" />);
  event();
  result.rerender(<ResourceRealtime channel="posts:all" id="2" />);
  act(() => vi.advanceTimersByTime(1000));
  expect(refresh).not.toHaveBeenCalled();
  event("2");
  result.rerender(<ResourceRealtime channel="posts" id="2" />);
  act(() => vi.advanceTimersByTime(1000));
  expect(refresh).not.toHaveBeenCalled();
  event("2");
  result.unmount();
  act(() => vi.advanceTimersByTime(1000));
  expect(refresh).not.toHaveBeenCalled();
});
it("상세는 다른 레코드의 이벤트를 무시하고 자신의 이벤트만 갱신한다", () => {
  render(<ResourceRealtime channel="posts:all" id="1" />);
  event("2");
  act(() => vi.advanceTimersByTime(1000));
  expect(refresh).not.toHaveBeenCalled();
  event("1");
  act(() => vi.advanceTimersByTime(999));
  expect(refresh).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(refresh).toHaveBeenCalledTimes(1);
});
it("숨은 탭의 이벤트는 복귀할 때 한 번만 갱신한다", () => {
  visibility("hidden");
  render(<ResourceRealtime channel="posts:all" />);
  event();
  act(() => vi.advanceTimersByTime(1500));
  event("2");
  act(() => vi.advanceTimersByTime(1500));
  expect(refresh).not.toHaveBeenCalled();
  visibility("visible");
  expect(refresh).toHaveBeenCalledTimes(1);
  visibility("visible");
  act(() => vi.advanceTimersByTime(1000));
  expect(refresh).toHaveBeenCalledTimes(1);
});
it.each([500, 1500])("예약 중 숨은 탭은 복귀 시점에 한 번만 갱신한다: %s", (resumeAt) => {
  render(<ResourceRealtime channel="posts:all" />);
  event();
  act(() => vi.advanceTimersByTime(200));
  visibility("hidden");
  act(() => vi.advanceTimersByTime(resumeAt - 200));
  expect(refresh).not.toHaveBeenCalled();
  visibility("visible");
  expect(refresh).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(1000));
  expect(refresh).toHaveBeenCalledTimes(1);
});
it.each(["channel", "record", "unmount"] as const)(
  "화면이 바뀌면 숨은 동안 보류한 이벤트를 버린다: %s",
  (change) => {
    visibility("hidden");
    const result = render(<ResourceRealtime channel="posts:all" id="1" />);
    event();
    if (change === "channel") result.rerender(<ResourceRealtime channel="posts" id="1" />);
    else if (change === "record") result.rerender(<ResourceRealtime channel="posts:all" id="2" />);
    else result.unmount();
    visibility("visible");
    act(() => vi.advanceTimersByTime(1000));
    expect(refresh).not.toHaveBeenCalled();
  },
);
