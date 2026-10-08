import { appOrigin } from "../app-config.mjs";
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { io } from "socket.io-client";
import { TestSocket } from "./test-socket";
import { RealtimeProvider, useChannel } from "./index";

vi.mock("socket.io-client", () => ({ io: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh() {}, replace() {} }),
  usePathname: () => "/posts",
}));
vi.mock("./actions", () => ({ getRealtimeTicket: vi.fn(), checkRealtimeSession: vi.fn() }));
let socket: TestSocket;
beforeEach(() => {
  socket = new TestSocket();
  vi.mocked(io).mockReturnValue(socket as unknown as ReturnType<typeof io>);
});
afterEach(cleanup);
function Consumer({ handler }: { handler: Parameters<typeof useChannel>[1] }) {
  useChannel("posts", handler);
  return null;
}
function show(children: React.ReactNode) {
  return render(
    <RealtimeProvider url={appOrigin("mock")} sessionKey={null}>
      {children}
    </RealtimeProvider>,
  );
}
it("연결 전 구독은 ack를 기다리고 다시 연결하면 재구독한다", () => {
  const handler = vi.fn();
  show(<Consumer handler={handler} />);
  expect(socket.emit).not.toHaveBeenCalled();
  act(() => socket.fire("connect"));
  expect(socket.emit).toHaveBeenCalledWith("subscribe", { channel: "posts" }, expect.any(Function));
  act(() => socket.fire("post.deleted", { data: { type: "posts", id: "id" } }));
  expect(handler).toHaveBeenCalledWith({
    name: "post.deleted",
    payload: { data: { type: "posts", id: "id" } },
  });
  act(() => {
    socket.fire("disconnect", "transport close");
    socket.fire("connect");
  });
  expect(socket.emit.mock.calls.filter(([name]) => name === "subscribe")).toHaveLength(2);
});
it("구독 거부 ack는 채널과 에러 코드만 로그에 남긴다", () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  show(<Consumer handler={vi.fn()} />);
  act(() => socket.fire("connect"));
  const ack = socket.emit.mock.calls[0]![2] as (ack: object) => void;
  ack({ ok: false, error: { code: "permission.denied", detail: "private detail" } });
  expect(warning).toHaveBeenCalledWith("실시간 채널 구독 거부", {
    channel: "posts",
    code: "permission.denied",
  });
  warning.mockRestore();
});
it("같은 채널의 소비자를 묶고 마지막 해제 때만 unsubscribe한다", () => {
  const first = vi.fn();
  const second = vi.fn();
  const view = show(
    <>
      <Consumer handler={first} />
      <Consumer handler={second} />
    </>,
  );
  act(() => socket.fire("connect"));
  expect(socket.emit.mock.calls.filter(([name]) => name === "subscribe")).toHaveLength(1);
  view.rerender(
    <RealtimeProvider url={appOrigin("mock")} sessionKey={null}>
      <Consumer handler={second} />
    </RealtimeProvider>,
  );
  expect(socket.emit.mock.calls.filter(([name]) => name === "unsubscribe")).toHaveLength(0);
  act(() => socket.fire("post.deleted", { data: { type: "posts", id: "id" } }));
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(socket.emit).toHaveBeenCalledWith("unsubscribe", { channel: "posts" });
  expect([...socket.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
});
it("렌더 뒤 최신 처리기를 쓰고 연결된 채널에 늦게 들어와도 구독한다", () => {
  socket.connected = true;
  const first = vi.fn();
  const second = vi.fn();
  const view = show(<Consumer handler={first} />);
  expect(socket.emit).toHaveBeenCalledWith("subscribe", { channel: "posts" }, expect.any(Function));
  view.rerender(
    <RealtimeProvider url={appOrigin("mock")} sessionKey={null}>
      <Consumer handler={second} />
    </RealtimeProvider>,
  );
  act(() => socket.fire("post.deleted", { data: { type: "posts", id: "id" } }));
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  expect(socket.emit.mock.calls.filter(([name]) => name === "subscribe")).toHaveLength(1);
});
