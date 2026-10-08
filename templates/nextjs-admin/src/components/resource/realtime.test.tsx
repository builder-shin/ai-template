// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useChannel } from "../../lib/realtime";
import { ResourceRealtime } from "./realtime";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../../lib/realtime", () => ({ useChannel: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
function event() {
  act(() =>
    vi
      .mocked(useChannel)
      .mock.calls.at(-1)![1]({
        name: "post.deleted",
        payload: { data: { type: "posts", id: "1" } },
      }),
  );
}
it("선언 채널을 구독하고 연속 이벤트를 100ms 뒤 한 번의 갱신으로 묶는다", () => {
  vi.useFakeTimers();
  render(<ResourceRealtime channel="posts:all" />);
  expect(useChannel).toHaveBeenCalledWith("posts:all", expect.any(Function));
  event();
  event();
  event();
  act(() => vi.advanceTimersByTime(99));
  expect(refresh).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(refresh).toHaveBeenCalledTimes(1);
  event();
  act(() => vi.advanceTimersByTime(100));
  expect(refresh).toHaveBeenCalledTimes(2);
});
it("페이지나 선언 채널을 바꾸면 이전 갱신 예약을 취소한다", () => {
  vi.useFakeTimers();
  const result = render(<ResourceRealtime channel="posts:all" />);
  event();
  result.rerender(<ResourceRealtime channel="posts" />);
  act(() => vi.advanceTimersByTime(100));
  expect(refresh).not.toHaveBeenCalled();
  event();
  result.unmount();
  act(() => vi.advanceTimersByTime(100));
  expect(refresh).not.toHaveBeenCalled();
});
