"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChannel } from "../../lib/realtime";
import type { components } from "../../lib/api/schema";

export function ResourceRealtime({
  channel,
}: {
  channel: components["schemas"]["RealtimeChannel"];
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    },
    [channel],
  );
  useChannel(channel, () => {
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      router.refresh();
    }, 100);
  });
  return null;
}
