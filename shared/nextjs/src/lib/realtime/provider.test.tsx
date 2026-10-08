import { appOrigin } from "../app-config.mjs";
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
  vi.restoreAllMocks();
});
function show(authenticated = true) {
  return render(
    <RealtimeProvider url={appOrigin("mock")} sessionKey={authenticated ? "current-session" : null}>
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
    appOrigin("mock"),
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
    <RealtimeProvider url={appOrigin("mock")} sessionKey="current-session">
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
    <RealtimeProvider url={appOrigin("mock")} sessionKey="current-session">
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
      <RealtimeProvider url={appOrigin("mock")} sessionKey={null}>
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
    <RealtimeProvider url={appOrigin("mock")} sessionKey="current-session">
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
      <RealtimeProvider url={appOrigin("mock")} sessionKey="current-session">
        <LocalForm pending={false} />
      </RealtimeProvider>,
    ),
  );
  expect(checkRealtimeSession).toHaveBeenCalledTimes(1);
  expect(router.refresh).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function identity(sessionKey: string | null) {
  return (
    <RealtimeProvider url={appOrigin("mock")} sessionKey={sessionKey}>
      <span />
    </RealtimeProvider>
  );
}

it.each([
  { nextKey: "account-b-session", ticket: null, state: "revoked" },
  { nextKey: "account-b-session", ticket: "late-a-ticket", state: "active" },
  { nextKey: "account-a-new-session", ticket: null, state: "revoked" },
  { nextKey: "account-a-new-session", ticket: "late-a-ticket", state: "active" },
] as const)(
  "새 로그인 $nextKey는 연결을 교체하고 이전 $state·$ticket 결과를 버린다",
  async ({ nextKey, ticket, state }) => {
    const oldTicket = deferred<string | null>();
    const oldCheck = deferred<Awaited<ReturnType<typeof checkRealtimeSession>>>();
    vi.mocked(getRealtimeTicket)
      .mockResolvedValueOnce("a-ticket")
      .mockReturnValueOnce(oldTicket.promise);
    vi.mocked(checkRealtimeSession).mockReturnValueOnce(oldCheck.promise);
    const view = render(identity("account-a-session"));
    expect(await handshake()).toHaveBeenCalledExactlyOnceWith({ ticket: "a-ticket" });
    const oldAnswer = vi.fn();
    await act(async () => {
      socket.auth(oldAnswer);
      socket.fire("session.revoked", { meta: { reason: "revoked" } });
    });
    await act(async () => view.rerender(identity(nextKey)));
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(2);
    expect(socket.disconnect.mock.invocationCallOrder[0]).toBeLessThan(
      socket.connect.mock.invocationCallOrder[1]!,
    );
    expect(await handshake()).toHaveBeenCalledExactlyOnceWith({ ticket: "first-ticket" });
    await act(async () => {
      oldTicket.resolve(ticket);
      oldCheck.resolve(state);
    });
    expect(oldAnswer).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    await act(async () => socket.fire("session.revoked", { meta: { reason: "revoked" } }));
    expect(checkRealtimeSession).toHaveBeenCalledTimes(2);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  },
);

it("로그인 교체는 폼 뒤에 대기한 이전 티켓·세션 확인·화면 갱신도 취소한다", async () => {
  const form = (sessionKey: string, pending: boolean) => (
    <RealtimeProvider url={appOrigin("mock")} sessionKey={sessionKey}>
      <LocalForm pending={pending} />
    </RealtimeProvider>
  );
  const view = render(form("account-a-session", true));
  const answer = vi.fn();
  await act(async () => {
    socket.auth(answer);
    socket.fire("session.revoked", { meta: { reason: "revoked" } });
    socket.fire("me.updated", { meta: { changed: ["profile"] } });
  });
  await act(async () => view.rerender(form("account-b-session", false)));
  expect(answer).not.toHaveBeenCalled();
  expect(getRealtimeTicket).not.toHaveBeenCalled();
  expect(checkRealtimeSession).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
  expect(router.refresh).not.toHaveBeenCalled();
  expect(await handshake()).toHaveBeenCalledExactlyOnceWith({ ticket: "first-ticket" });
});

it("토큰 갱신 뒤에도 같은 세션 키는 연결과 진행 중인 인증을 유지한다", async () => {
  const ticket = deferred<string>();
  vi.mocked(getRealtimeTicket).mockReturnValueOnce(ticket.promise);
  const view = render(identity("account-a-session"));
  const answer = vi.fn();
  await act(async () => socket.auth(answer));
  await act(async () => view.rerender(identity("account-a-session")));
  await act(async () => ticket.resolve("refreshed-ticket"));
  expect(answer).toHaveBeenCalledExactlyOnceWith({ ticket: "refreshed-ticket" });
  expect(socket.connect).toHaveBeenCalledTimes(1);
  expect(socket.disconnect).not.toHaveBeenCalled();
  expect(getRealtimeTicket).toHaveBeenCalledTimes(1);
});

function form(pending: boolean, authenticated = true) {
  return (
    <RealtimeProvider url={appOrigin("mock")} sessionKey={authenticated ? "current-session" : null}>
      <LocalForm pending={pending} />
    </RealtimeProvider>
  );
}

it.each([
  { state: "revoked", authenticated: true },
  { state: "active", authenticated: true },
  { state: "revoked", authenticated: false },
  { state: "active", authenticated: false },
] as const)(
  "늦은 $state 세션 결과는 폼 뒤 authenticated=$authenticated 상태에서 적용한다",
  async ({ state, authenticated }) => {
    const result = deferred<Awaited<ReturnType<typeof checkRealtimeSession>>>();
    vi.mocked(checkRealtimeSession).mockReturnValueOnce(result.promise);
    const view = render(form(false));
    await act(async () => socket.fire("session.revoked", { meta: { reason: "revoked" } }));
    expect(checkRealtimeSession).toHaveBeenCalledTimes(1);
    await act(async () => view.rerender(form(true)));
    await act(async () => result.resolve(state));
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    await act(async () => view.rerender(form(false, authenticated)));
    if (!authenticated) {
      expect(router.replace).not.toHaveBeenCalled();
      expect(router.refresh).not.toHaveBeenCalled();
    } else if (state === "revoked") {
      expect(router.replace).toHaveBeenCalledWith("/en/login?returnTo=%2Fen%2Fme%2Fsessions");
    } else {
      expect(router.replace).not.toHaveBeenCalled();
      expect(router.refresh).toHaveBeenCalledTimes(1);
    }
  },
);

it.each([
  { ticket: null, authenticated: true },
  { ticket: "late-ticket", authenticated: true },
  { ticket: null, authenticated: false },
  { ticket: "late-ticket", authenticated: false },
] as const)(
  "늦은 $ticket 티켓 결과는 폼 뒤 authenticated=$authenticated 상태에서 적용한다",
  async ({ ticket, authenticated }) => {
    const result = deferred<string | null>();
    vi.mocked(getRealtimeTicket).mockReturnValueOnce(result.promise);
    const view = render(form(false));
    const answer = vi.fn();
    await act(async () => socket.auth(answer));
    expect(getRealtimeTicket).toHaveBeenCalledTimes(1);
    await act(async () => view.rerender(form(true)));
    await act(async () => result.resolve(ticket));
    expect(answer).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    await act(async () => view.rerender(form(false, authenticated)));
    if (!authenticated) {
      expect(answer).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
      expect(router.refresh).not.toHaveBeenCalled();
    } else if (ticket) {
      expect(answer).toHaveBeenCalledExactlyOnceWith({ ticket });
      expect(router.replace).not.toHaveBeenCalled();
    } else {
      expect(answer).not.toHaveBeenCalled();
      expect(router.replace).toHaveBeenCalledWith("/en/login?returnTo=%2Fen%2Fme%2Fsessions");
    }
  },
);

it.each([
  { disconnect: true, oldFirst: true },
  { disconnect: true, oldFirst: false },
  { disconnect: false, oldFirst: true },
  { disconnect: false, oldFirst: false },
])(
  "새 인증은 이전 티켓을 버린다: disconnect=$disconnect, oldFirst=$oldFirst",
  async ({ disconnect, oldFirst }) => {
    const oldTicket = deferred<string>();
    const freshTicket = deferred<string>();
    vi.mocked(getRealtimeTicket)
      .mockReturnValueOnce(oldTicket.promise)
      .mockReturnValueOnce(freshTicket.promise);
    show();
    const oldConnect = vi.fn();
    const freshConnect = vi.fn();
    await act(async () => socket.auth(oldConnect));
    if (disconnect) act(() => socket.fire("disconnect", "transport close"));
    await act(async () => socket.auth(freshConnect));
    expect(getRealtimeTicket).toHaveBeenCalledTimes(2);
    if (oldFirst) {
      await act(async () => oldTicket.resolve("old-ticket"));
      expect(oldConnect).not.toHaveBeenCalled();
      expect(freshConnect).not.toHaveBeenCalled();
      await act(async () => freshTicket.resolve("fresh-ticket"));
    } else {
      await act(async () => freshTicket.resolve("fresh-ticket"));
      await act(async () => oldTicket.resolve("old-ticket"));
    }
    expect(oldConnect).not.toHaveBeenCalled();
    expect(freshConnect).toHaveBeenCalledExactlyOnceWith({ ticket: "fresh-ticket" });
  },
);

it.each(["success", "failure"] as const)(
  "연결이 끊긴 인증의 늦은 %s는 CONNECT와 재시도를 만들지 않는다",
  async (outcome) => {
    vi.useFakeTimers();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ticket = deferred<string>();
    vi.mocked(getRealtimeTicket).mockReturnValueOnce(ticket.promise);
    show();
    const answer = vi.fn();
    await act(async () => socket.auth(answer));
    act(() => socket.fire("disconnect", "transport close"));
    await act(async () => {
      if (outcome === "success") ticket.resolve("old-ticket");
      else ticket.reject(new Error("old failure"));
    });
    expect(answer).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  },
);

it("이전 티켓 실패는 재연결로 인증한 연결에 재시도를 걸지 않는다", async () => {
  vi.useFakeTimers();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const oldTicket = deferred<string>();
  vi.mocked(getRealtimeTicket)
    .mockReturnValueOnce(oldTicket.promise)
    .mockResolvedValueOnce("fresh-ticket");
  show();
  const oldConnect = vi.fn();
  await act(async () => socket.auth(oldConnect));
  act(() => socket.fire("disconnect", "transport close"));
  const freshConnect = await handshake();
  act(() => socket.fire("connect"));
  expect(freshConnect).toHaveBeenCalledExactlyOnceWith({ ticket: "fresh-ticket" });
  await act(async () => oldTicket.reject(new Error("old failure")));
  expect(oldConnect).not.toHaveBeenCalled();
  expect(warning).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1000));
  expect(socket.connect).toHaveBeenCalledTimes(1);
  expect(socket.disconnect).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});

it.each([
  { code: "auth.token_invalid", expected: "auth.token_invalid" },
  { code: "private-code", expected: "internal.unexpected" },
  { code: undefined, expected: "internal.unexpected" },
  { code: 42, expected: "internal.unexpected" },
])("연결 실패는 허용한 $expected 코드만 기록한다: $code", ({ code, expected }) => {
  vi.useFakeTimers();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  show();
  const error = Object.assign(new Error("private message"), {
    data: { code, detail: "private detail", ticket: "private ticket" },
  });
  act(() => socket.fire("connect_error", error));
  expect(warning.mock.calls).toEqual([["실시간 연결 실패", { code: expected }]]);
});
