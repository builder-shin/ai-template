/**
 * 수명이 있는 1회용 값. FastAPI가 Valkey에 SET ... EX로 두고 GETDEL로 꺼내는 값(소셜 로그인의 state와
 * 1회용 코드)과 가짜 OAuth 서버의 인가 코드가 쓴다.
 *
 * - 만료 시각이 지난 값은 없는 것으로 본다. 시계는 상태의 시계(MockState.clock)라 테스트가 시간을
 *   앞으로 돌릴 수 있다.
 * - 값을 넣을 때 만료된 값을 치운다. 꺼내지 않은 값이 쌓여도 수명이 지나면 사라진다.
 */

import type { Clock, Instant } from "./clock.ts";

export interface ExpiringMap<V> {
  /** 값을 ttl(마이크로초) 동안 둔다. 같은 키가 있으면 바꾼다. */
  set(key: string, value: V, ttl: number): void;
  /** 값을 꺼내면서 지운다(Valkey의 GETDEL). 없거나 만료됐으면 undefined다. */
  take(key: string): V | undefined;
}

interface Entry<V> {
  readonly value: V;
  readonly expiresAt: Instant;
}

export function createExpiringMap<V>(clock: Clock): ExpiringMap<V> {
  const entries = new Map<string, Entry<V>>();
  return {
    set(key, value, ttl) {
      const now = clock.now();
      for (const [other, entry] of entries) {
        if (entry.expiresAt <= now) entries.delete(other);
      }
      entries.set(key, { value, expiresAt: now + ttl });
    },
    take(key) {
      const entry = entries.get(key);
      entries.delete(key);
      return entry !== undefined && entry.expiresAt > clock.now() ? entry.value : undefined;
    },
  };
}
