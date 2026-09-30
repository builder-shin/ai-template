/**
 * 실시간 이벤트의 발행 지점. 모듈은 상태가 바뀐 뒤 이벤트(계약의 x-realtime-events)를 여기에 내고,
 * 연결을 다시 검사할 사용자를 알린다(FastAPI의 core/realtime.py의 queue, queue_recheck).
 *
 * - 목은 트랜잭션이 없어 바꾼 즉시 낸다. FastAPI는 commit한 뒤에 낸다. 받는 쪽에서는 같다.
 * - 받는 쪽(Socket.IO 게이트웨이)은 listen으로 붙는다. 붙은 쪽이 없으면 버린다. 테스트는 listen으로
 *   낸 이벤트를 모은다(FastAPI 테스트의 RecordingPublisher).
 */

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
  /** 받는 쪽을 붙인다. 돌려준 함수를 부르면 뗀다. */
  listen(listener: RealtimeListener): () => void;
}

/** 사용자 한 사람의 룸. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function createRealtimeHub(): RealtimeHub {
  const listeners = new Set<RealtimeListener>();
  return {
    publish(event) {
      for (const listener of listeners) listener.event?.(event);
    },
    recheck(userIds) {
      for (const listener of listeners) listener.recheck?.(userIds);
    },
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
