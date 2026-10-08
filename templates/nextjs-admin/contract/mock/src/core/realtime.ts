/**
 * 실시간 이벤트의 발행 지점. 모듈은 상태가 바뀐 뒤 이벤트(계약의 x-realtime-events)를 여기에 내고,
 * 연결을 다시 검사할 사용자를 알린다(FastAPI의 core/realtime.py의 queue, queue_recheck).
 *
 * - 목은 트랜잭션이 없어 바꾼 즉시 낸다. FastAPI는 commit한 뒤에 낸다. 받는 쪽에서는 같다.
 * - 한 트랜잭션에서 알림을 여럿 내는 유스케이스(예: 비활성화와 역할 변경을 함께)는 batch로 감싼다.
 *   FastAPI의 commit처럼 이벤트를 낸 순서대로 모두 보낸 뒤, 다시 검사할 사용자를 한 번에 알린다. 그래서
 *   재검사로 끊길 연결도 그 트랜잭션의 이벤트를 모두 받는다.
 * - 받는 쪽(실시간 서버, modules/realtime/server.ts)은 listen으로 붙는다. 붙은 쪽이 없으면 버린다.
 *   테스트는 listen으로 낸 이벤트를 모은다(FastAPI 테스트의 RecordingPublisher).
 */

import { compareText } from "./permissions.ts";

export interface RealtimeEvent {
  /** 이벤트 이름. 예: session.revoked */
  readonly name: string;
  /** 받을 룸. 예: user:<id> */
  readonly rooms: readonly string[];
  /** 페이로드(계약의 이벤트 문서). */
  readonly payload: unknown;
}

export interface RealtimeListener {
  /** 이벤트를 받는다. */
  readonly event?: (event: RealtimeEvent) => void;
  /** 이 사용자들의 연결을 다시 검사한다(세션이 끝났거나 권한을 잃은 연결을 끊는다). */
  readonly recheck?: (userIds: readonly string[]) => void;
}

export interface RealtimeHub {
  publish(event: RealtimeEvent): void;
  recheck(userIds: readonly string[]): void;
  /**
   * work 안에서 낸 이벤트와 재검사를 모았다가 work가 끝나면 보낸다(FastAPI의 commit): 이벤트를 낸
   * 순서대로 보낸 뒤, 다시 검사할 사용자를 한 번에(id 순, 겹치지 않게) 알린다. work가 던지면 모두
   * 버린다(rollback). 안에서 다시 부르면 바깥 batch에 합친다. work는 동기 함수여야 한다(도중에 다른
   * 요청이 끼어들지 않게).
   */
  batch<T>(work: () => T): T;
  /** 받는 쪽을 붙인다. 돌려준 함수를 부르면 뗀다. */
  listen(listener: RealtimeListener): () => void;
}

/** 사용자 한 사람의 룸. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

interface Pending {
  readonly events: RealtimeEvent[];
  readonly rechecks: Set<string>;
}

export function createRealtimeHub(): RealtimeHub {
  const listeners = new Set<RealtimeListener>();
  let pending: Pending | undefined;
  const deliver = (event: RealtimeEvent) => {
    for (const listener of listeners) listener.event?.(event);
  };
  const deliverRecheck = (userIds: readonly string[]) => {
    for (const listener of listeners) listener.recheck?.(userIds);
  };
  return {
    publish(event) {
      if (pending === undefined) deliver(event);
      else pending.events.push(event);
    },
    recheck(userIds) {
      if (pending === undefined) deliverRecheck(userIds);
      else for (const userId of userIds) pending.rechecks.add(userId);
    },
    batch(work) {
      if (pending !== undefined) return work();
      const current: Pending = { events: [], rechecks: new Set() };
      pending = current;
      let result: ReturnType<typeof work>;
      try {
        result = work();
      } finally {
        pending = undefined;
      }
      if (result instanceof Promise) throw new Error("batch의 work는 동기 함수여야 한다.");
      for (const event of current.events) deliver(event);
      if (current.rechecks.size > 0) deliverRecheck([...current.rechecks].sort(compareText));
      return result;
    },
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
