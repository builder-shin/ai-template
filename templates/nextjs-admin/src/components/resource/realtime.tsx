"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChannel } from "../../lib/realtime";
import type { components } from "../../lib/api/schema";

export function ResourceRealtime({
  channel,
  id,
}: {
  channel: components["schemas"]["RealtimeChannel"];
  id?: string;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    function resume() {
      if (document.visibilityState === "hidden" || !pending.current) return;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      pending.current = false;
      router.refresh();
    }
    document.addEventListener("visibilitychange", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      pending.current = false;
    };
  }, [channel, id, router]);
  useChannel(channel, (event) => {
    if (id !== undefined && event.payload.data.id !== id) return;
    pending.current = true;
    // 숨은 탭은 이벤트가 왔다는 사실만 남기고 복귀 때 한 번 갱신한다.
    if (document.visibilityState === "hidden") return;
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (document.visibilityState === "hidden") return;
      pending.current = false;
      router.refresh();
    }, 1000);
  });
  return null;
}
