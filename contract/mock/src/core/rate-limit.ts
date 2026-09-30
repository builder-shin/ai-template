/**
 * 레이트 리밋: 고정 윈도 카운터. FastAPI 템플릿의 core/ratelimit.py와 같은 규칙이다.
 *
 * - 대상(IP, 이메일 해시 등)마다 윈도를 처음 셀 때 윈도 길이만큼의 끝 시각을 정하고, 그 안의 요청을 센다.
 *   FastAPI는 Valkey 키를 INCR하고 처음 센 때만 EXPIRE를 건다. 목은 메모리에 같은 카운터를 둔다.
 * - 한도를 넘으면 429 rate_limit.exceeded와 Retry-After(윈도가 끝날 때까지 남은 초, 반올림, 1 이상)다.
 *   meta.params.retryAfter에도 같은 값을 담는다.
 * - 엄격한 한도(로그인, 가입, 메일 요청)는 각 모듈의 서비스가 enforce로 건다. 한도 값은 설정에서 온다.
 */

import { ApiError } from "../jsonapi/errors.ts";
import { type Clock, HOUR, type Instant, MINUTE, SECOND } from "./clock.ts";

/** 윈도 길이. 설정의 한도는 이 윈도마다의 요청 수다. */
export const PER_MINUTE = MINUTE;
export const PER_HOUR = HOUR;

export interface Limit {
  /** 키 이름공간. 예: login-ip */
  readonly name: string;
  /** 윈도 하나에 받는 요청 수. */
  readonly limit: number;
  /** 윈도 길이(마이크로초). */
  readonly window: number;
}

export interface RateLimiter {
  /** subject의 요청을 하나 센다. 한도 안이면 undefined, 넘었으면 윈도가 끝날 때까지 남은 초(1 이상)다. */
  hit(limit: Limit, subject: string): number | undefined;
}

interface Window {
  count: number;
  readonly endsAt: Instant;
}

export function createRateLimiter(clock: Clock): RateLimiter {
  const windows = new Map<string, Window>();
  return {
    hit(limit, subject) {
      const key = `${limit.name}:${subject}`;
      const now = clock.now();
      let window = windows.get(key);
      if (window === undefined || window.endsAt <= now) {
        window = { count: 0, endsAt: now + limit.window };
        windows.set(key, window);
      }
      window.count += 1;
      if (window.count <= limit.limit) return undefined;
      // Valkey의 TTL처럼 남은 시간을 초 단위로 반올림한다.
      return Math.max(Math.round((window.endsAt - now) / SECOND), 1);
    },
  };
}

export function tooManyRequests(retryAfter: number): ApiError {
  const detail = `Too many requests. Retry after ${String(retryAfter)} seconds.`;
  return new ApiError(429, "rate_limit.exceeded", detail, {
    params: { retryAfter },
    headers: { "Retry-After": String(retryAfter) },
  });
}

/** 요청을 세고, 한도를 넘었으면 429 ApiError를 던진다. */
export function enforce(limiter: RateLimiter, limit: Limit, subject: string): void {
  const retryAfter = limiter.hit(limit, subject);
  if (retryAfter !== undefined) throw tooManyRequests(retryAfter);
}
