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
import { createMutationBarrier, RealtimeMutationsContext } from "./mutations";

const RealtimeContext = createContext<RealtimeSocket | null>(null);

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
    let checking: Promise<void> | undefined;
    let signingOut = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const retry = () => {
      if (!active || signingOut || retryTimer) return;
      socket.disconnect();
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (active && !signingOut) socket.connect();
      }, 1000);
    };
    setSocketAuthentication(socket, (answer) => {
      if (!authenticated) {
        answer({});
        return;
      }
      void mutations
        .wait()
        .then(() => (active && !signingOut ? getRealtimeTicket() : undefined))
        .then((ticket) => {
          if (!active || signingOut) return;
          if (ticket) answer({ ticket });
          else {
            signingOut = true;
            socket.disconnect();
            goToLogin();
          }
        })
        .catch(() => {
          if (active) {
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
        .then((state) => {
          if (!active) return;
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
      if (reason === "io server disconnect" && active && !signingOut) socket.connect();
    };
    const failed = () => {
      console.warn("실시간 연결 실패");
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
