"use client";

import { createContext, useContext, useEffect } from "react";

/** 현재 탭의 폼 결과가 적용되기 전에 실시간 확인이 이동·성공 안내를 덮어쓰지 않게 한다. */
export function createMutationBarrier() {
  const pending = new Set<symbol>();
  const waiting = new Set<() => void>();
  return {
    begin() {
      const id = Symbol();
      pending.add(id);
      return () => {
        pending.delete(id);
        if (pending.size) return;
        for (const resolve of waiting) resolve();
        waiting.clear();
      };
    },
    wait() {
      return pending.size
        ? new Promise<void>((resolve) => waiting.add(resolve))
        : Promise.resolve();
    },
  };
}

export const RealtimeMutationsContext = createContext<ReturnType<
  typeof createMutationBarrier
> | null>(null);

/** useFormStatus의 pending을 연결한다. Provider 밖의 독립 폼에도 쓸 수 있다. */
export function useRealtimeFormStatus(pending: boolean) {
  const mutations = useContext(RealtimeMutationsContext);
  useEffect(() => (pending ? mutations?.begin() : undefined), [mutations, pending]);
}
