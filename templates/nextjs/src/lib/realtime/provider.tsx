"use client";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { getRealtimeTicket, checkRealtimeSession } from "./actions";
import {
  subscribeChannel,
  setSocketAuthentication,
  type RealtimeSocket,
  type PostEvent,
} from "./channel";
import type { components } from "../api/schema";
import { errorCodes } from "../generated/error-codes";
import { createMutationBarrier, RealtimeMutationsContext } from "./mutations";

const RealtimeContext = createContext<RealtimeSocket | null>(null);
const knownCodes = new Set<string>(errorCodes);

export function RealtimeProvider({
  children,
  url,
  authenticated,
}: {
  children: ReactNode;
  url: string;
  authenticated: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const mutations = useMemo(() => createMutationBarrier(), []);
  const socket = useMemo(
    () =>
      io(url, {
        transports: ["websocket"],
        autoConnect: false,
        forceNew: true,
      }) as RealtimeSocket,
    [url],
  );
  const goToLogin = useEffectEvent(() => {
    const prefix = /^\/en(?:\/|$)/.test(pathname) ? "/en" : "";
    router.replace(`${prefix}/login?${new URLSearchParams({ returnTo: pathname })}`);
    router.refresh();
  });
  const refresh = useEffectEvent(() => router.refresh());
  useEffect(() => {
    let active = true;
    let authGeneration = 0;
    let checking: Promise<void> | undefined;
    let signingOut = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const retry = () => {
      if (!active || signingOut || retryTimer) return;
      authGeneration++;
      socket.disconnect();
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (active && !signingOut) socket.connect();
      }, 1000);
    };
    setSocketAuthentication(socket, (answer) => {
      // 같은 effect 안에서도 새 인증 시도가 이전 응답·실패를 무효화한다.
      const generation = ++authGeneration;
      const current = () => active && !signingOut && generation === authGeneration;
      if (!authenticated) {
        if (current()) answer({});
        return;
      }
      void mutations
        .wait()
        .then(() => (current() ? getRealtimeTicket() : undefined))
        .then(async (ticket) => {
          // 요청 도중 시작한 폼도 결과를 적용하기 전에 기다린다.
          await mutations.wait();
          if (!current()) return;
          if (ticket) answer({ ticket });
          else {
            signingOut = true;
            socket.disconnect();
            goToLogin();
          }
        })
        .catch(async () => {
          await mutations.wait();
          if (current()) {
            console.warn("실시간 티켓 발급 실패");
            retry();
          }
        });
    });
    const revoked = () => {
      if (checking || signingOut) return;
      checking = mutations
        .wait()
        .then(() => (active ? checkRealtimeSession() : undefined))
        .then(async (state) => {
          await mutations.wait();
          if (!active || signingOut) return;
          if (state === "revoked") {
            signingOut = true;
            socket.disconnect();
            goToLogin();
          } else if (state === "active") refresh();
        })
        .catch(() => {
          if (active) console.warn("실시간 세션 확인 실패");
        })
        .finally(() => {
          checking = undefined;
        });
    };
    const disconnected = (reason: string) => {
      authGeneration++;
      if (reason === "io server disconnect" && active && !signingOut) socket.connect();
    };
    const failed = (error: Error & { data?: unknown }) => {
      const candidate =
        error.data !== null && typeof error.data === "object" && "code" in error.data
          ? error.data.code
          : undefined;
      const code =
        typeof candidate === "string" && knownCodes.has(candidate)
          ? candidate
          : "internal.unexpected";
      console.warn("실시간 연결 실패", { code });
      // 네트워크 단절은 Socket.IO가 재시도하고, 인증 거부만 새 티켓으로 다시 연결한다.
      if (!socket.active) retry();
    };
    const updated = () => {
      void mutations.wait().then(() => {
        if (active) refresh();
      });
    };
    socket.on("session.revoked", revoked);
    socket.on("me.updated", updated);
    socket.on("disconnect", disconnected);
    socket.on("connect_error", failed);
    socket.connect();
    return () => {
      active = false;
      authGeneration++;
      if (retryTimer) clearTimeout(retryTimer);
      socket.off("session.revoked", revoked);
      socket.off("me.updated", updated);
      socket.off("disconnect", disconnected);
      socket.off("connect_error", failed);
      socket.disconnect();
    };
  }, [socket, authenticated, mutations]);
  return (
    <RealtimeMutationsContext value={mutations}>
      <RealtimeContext value={socket}>{children}</RealtimeContext>
    </RealtimeMutationsContext>
  );
}

export function useChannel(
  channel: components["schemas"]["RealtimeChannel"],
  handler: (event: PostEvent) => void,
) {
  const socket = useContext(RealtimeContext);
  const receive = useEffectEvent(handler);
  useEffect(() => {
    if (!socket) throw new Error("useChannel은 RealtimeProvider 안에서 사용한다.");
    return subscribeChannel(socket, channel, receive);
  }, [socket, channel]);
}
