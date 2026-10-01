// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { io } from "socket.io-client";
import { TestSocket } from "./test-socket";
import { RealtimeProvider } from "./provider";
import { useRealtimeFormStatus } from "./index";
import { getRealtimeTicket, checkRealtimeSession } from "./actions";

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("socket.io-client", () => ({ io: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/en/me/sessions",
}));
vi.mock("./actions", () => ({ getRealtimeTicket: vi.fn(), checkRealtimeSession: vi.fn() }));
let socket: TestSocket;
beforeEach(() => {
  vi.resetAllMocks();
  socket = new TestSocket();
  vi.mocked(io).mockReturnValue(socket as unknown as ReturnType<typeof io>);
  vi.mocked(getRealtimeTicket).mockResolvedValue("first-ticket");
  vi.mocked(checkRealtimeSession).mockResolvedValue("active");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function show(authenticated = true) {
  return render(
    <RealtimeProvider url="http://localhost:4010" authenticated={authenticated}>
      <span />
    </RealtimeProvider>,
  );
}
async function handshake() {
  const answer = vi.fn();
  await act(async () => socket.auth(answer));
  return answer;
}
it("연결 하나는 WebSocket만 쓰고 연결·서버 재연결마다 새 티켓을 받는다", async () => {
  const view = show();
  expect(io).toHaveBeenCalledWith(
    "http://localhost:4010",
    expect.objectContaining({
      transports: ["websocket"],
      autoConnect: false,
      forceNew: true,
    }),
  );
  expect(socket.connect).toHaveBeenCalledTimes(1);
  expect(await handshake()).toHaveBeenCalledWith({ ticket: "first-ticket" });
  vi.mocked(getRealtimeTicket).mockResolvedValueOnce("second-ticket");
  act(() => socket.fire("disconnect", "io server disconnect"));
  expect(socket.connect).toHaveBeenCalledTimes(2);
  expect(await handshake()).toHaveBeenCalledWith({ ticket: "second-ticket" });
  act(() => socket.fire("disconnect", "transport close"));
  expect(socket.connect).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(socket.disconnect).toHaveBeenCalledTimes(1);
  expect([...socket.listeners.values()].every((entries) => entries.size === 0)).toBe(true);
});
it("익명 연결은 티켓 Action을 호출하지 않고 인증 변경은 연결을 교체한다", async () => {
  const view = show(false);
  expect(await handshake()).toHaveBeenCalledWith({});
  expect(getRealtimeTicket).not.toHaveBeenCalled();
  view.rerender(
    <RealtimeProvider url="http://localhost:4010" authenticated>
      <span />
    </RealtimeProvider>,
  );
  expect(socket.disconnect).toHaveBeenCalledTimes(1);
  expect(await handshake()).toHaveBeenCalledWith({ ticket: "first-ticket" });
});
it("끝난 세션·티켓 실패·해제 뒤의 늦은 티켓은 익명 인증으로 우회하지 않는다", async () => {
  show();
  vi.mocked(getRealtimeTicket).mockResolvedValueOnce(null);
  expect(await handshake()).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith("/en/login?returnTo=%2Fen%2Fme%2Fsessions");
  router.replace.mockClear();
  cleanup();
  show();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(getRealtimeTicket).mockRejectedValueOnce(new Error("connection failed"));
  expect(await handshake()).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
  expect(warning).toHaveBeenCalled();
  let resolve!: (ticket: string) => void;
  vi.mocked(getRealtimeTicket).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const answer = vi.fn();
  await act(async () => socket.auth(answer));
  cleanup();
  await act(async () => resolve("late-ticket"));
  expect(answer).not.toHaveBeenCalled();
  warning.mockRestore();
});
it("me.updated는 서버 화면을 갱신한다", async () => {
  show();
  await act(async () => socket.fire("me.updated", { meta: { changed: ["profile"] } }));
  expect(router.refresh).toHaveBeenCalledTimes(1);
});
it("세션 폐기 확인을 묶고 현재 세션이 끝났을 때만 로그인으로 간다", async () => {
  show();
  let resolve!: (state: "revoked") => void;
  vi.mocked(checkRealtimeSession).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await act(async () => {
    socket.fire("session.revoked", { meta: { reason: "revoked" } });
    socket.fire("session.revoked", { meta: { reason: "revoked" } });
    resolve("revoked");
  });
  expect(checkRealtimeSession).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith("/en/login?returnTo=%2Fen%2Fme%2Fsessions");
});
it("다른 세션 폐기와 확인 연결 실패는 현재 로그인을 유지한다", async () => {
  show();
  await act(async () => socket.fire("session.revoked", { meta: { reason: "password_changed" } }));
  expect(router.refresh).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
  vi.mocked(checkRealtimeSession).mockResolvedValueOnce("unavailable");
  await act(async () => socket.fire("session.revoked", { meta: { reason: "revoked" } }));
  expect(router.refresh).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
});
it("티켓 발급·연결 거부는 새 티켓으로 재시도하고 해제 때 재시도 타이머를 지운다", async () => {
  vi.useFakeTimers();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const view = show();
  vi.mocked(getRealtimeTicket).mockRejectedValueOnce(new Error("temporary failure"));
  await handshake();
  act(() => vi.advanceTimersByTime(1000));
  expect(socket.connect).toHaveBeenCalledTimes(2);
  expect(await handshake()).toHaveBeenCalledWith({ ticket: "first-ticket" });
  act(() => socket.fire("connect_error", new Error("auth.token_invalid")));
  act(() => vi.advanceTimersByTime(1000));
  expect(socket.connect).toHaveBeenCalledTimes(3);
  act(() => socket.fire("connect_error", new Error("auth.token_invalid")));
  view.unmount();
  act(() => vi.advanceTimersByTime(1000));
  expect(socket.connect).toHaveBeenCalledTimes(3);
  expect(router.replace).not.toHaveBeenCalled();
  warning.mockRestore();
});

function LocalForm({ pending }: { pending: boolean }) {
  useRealtimeFormStatus(pending);
  return null;
}
it("현재 폼 제출 중의 확인·재인증은 제출 결과가 로그아웃하면 취소한다", async () => {
  const view = render(
    <RealtimeProvider url="http://localhost:4010" authenticated>
      <LocalForm pending />
    </RealtimeProvider>,
  );
  const answer = vi.fn();
  await act(async () => {
    socket.auth(answer);
    socket.fire("session.revoked", { meta: { reason: "logout" } });
    socket.fire("me.updated", { meta: { changed: ["profile"] } });
  });
  expect(getRealtimeTicket).not.toHaveBeenCalled();
  expect(checkRealtimeSession).not.toHaveBeenCalled();
  expect(router.refresh).not.toHaveBeenCalled();
  await act(async () =>
    view.rerender(
      <RealtimeProvider url="http://localhost:4010" authenticated={false}>
        <LocalForm pending={false} />
      </RealtimeProvider>,
    ),
  );
  expect(answer).not.toHaveBeenCalled();
  expect(checkRealtimeSession).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});
it("현재 폼이 끝나고 로그인이 유지되면 대기한 확인을 한 번 실행한다", async () => {
  const view = render(
    <RealtimeProvider url="http://localhost:4010" authenticated>
      <LocalForm pending />
    </RealtimeProvider>,
  );
  await act(async () => {
    socket.fire("session.revoked", { meta: { reason: "revoked" } });
    socket.fire("session.revoked", { meta: { reason: "revoked" } });
  });
  expect(checkRealtimeSession).not.toHaveBeenCalled();
  await act(async () =>
    view.rerender(
      <RealtimeProvider url="http://localhost:4010" authenticated>
        <LocalForm pending={false} />
      </RealtimeProvider>,
    ),
  );
  expect(checkRealtimeSession).toHaveBeenCalledTimes(1);
  expect(router.refresh).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
});
