/**
 * 시각. 목의 시각은 Unix epoch 기준 마이크로초(Instant)다.
 *
 * - FastAPI는 시각을 마이크로초까지 담고(PostgreSQL timestamptz) Pydantic이 그대로 내보낸다. 목도 같은
 *   정밀도로 기록하고 같은 모양(formatInstant)으로 내보낸다.
 * - 시스템 시계는 같은 값을 두 번 주지 않는다. 밀리초 시계라면 같은 순간에 만든 세션 둘의 시각이 같아
 *   정렬(-lastUsedAt 등)이 FastAPI와 달라질 수 있다.
 * - 시계는 상태(MockState.clock)에 있어 테스트가 시간을 앞으로 돌릴 수 있다.
 */

/** Unix epoch 기준 마이크로초. */
export type Instant = number;

export const SECOND = 1_000_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface Clock {
  /** 지금 시각. */
  now(): Instant;
}

/** 시스템 시계. 앞서 준 값보다 늘 크다(단조 증가). */
export function systemClock(): Clock {
  let last = 0;
  return {
    now() {
      const current = Math.floor((performance.timeOrigin + performance.now()) * 1000);
      last = Math.max(current, last + 1);
      return last;
    },
  };
}

/**
 * RFC 3339 UTC 문자열. Pydantic이 시각을 내보내는 모양과 같다: 마이크로초가 있으면 여섯 자리로 쓰고,
 * 0이면 소수 부분을 뺀다. 예: 2026-09-30T01:02:03.456789Z, 2026-09-30T01:02:03Z
 */
export function formatInstant(instant: Instant): string {
  const micros = ((instant % SECOND) + SECOND) % SECOND;
  const seconds = new Date((instant - micros) / 1000).toISOString().slice(0, 19);
  return micros === 0 ? `${seconds}Z` : `${seconds}.${String(micros).padStart(6, "0")}Z`;
}
