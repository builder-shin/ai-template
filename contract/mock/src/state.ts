/**
 * 목의 메모리 상태. 데이터는 프로세스 메모리에 있고 재시작하면 처음으로 돌아간다.
 * 자원을 더하면 여기에 더하고 createState에서 만든다.
 */

import { type Clock, systemClock } from "./core/clock.ts";
import { createExpiringMap, type ExpiringMap } from "./core/expiring.ts";
import { createRateLimiter, type RateLimiter } from "./core/rate-limit.ts";
import { createRealtimeHub, type RealtimeHub } from "./core/realtime.ts";
import { createOutbox, type Outbox } from "./mail/outbox.ts";
import type { OAuthStore } from "./modules/auth/model.ts";
import { createFileRegistry, type FileRegistry } from "./modules/files/registry.ts";
import type { MembersChanged } from "./modules/roles/management.ts";
import type { RealtimeTicket } from "./modules/realtime/tickets.ts";
import type { AccountCloser } from "./modules/users/accounts.ts";
import { createOAuthServer, type OAuthServer } from "./oauth-server/server.ts";
import { createStorage, type Storage } from "./storage/bucket.ts";
import { createStore, type Store } from "./store.ts";

export interface MockState {
  /** 시계. 테스트는 시간을 앞으로 돌리는 시계를 넣는다. */
  readonly clock: Clock;
  /** 테이블(계정, 역할, 세션, 감사 로그 등). */
  readonly store: Store;
  /** 레이트 리밋 카운터(FastAPI의 Valkey 카운터). */
  readonly limiter: RateLimiter;
  /** 실시간 이벤트의 발행 지점. */
  readonly realtime: RealtimeHub;
  /** 실시간 티켓(30초, 1회용). 키는 티켓의 digest다. FastAPI가 Valkey에 두는 값이다. */
  readonly realtimeTickets: ExpiringMap<RealtimeTicket>;
  /** 보낸 메일 보관함. */
  readonly outbox: Outbox;
  /** 가짜 스토리지의 버킷(객체와 presigned URL). */
  readonly storage: Storage;
  /** 소셜 로그인의 state(10분)와 1회용 코드(60초). FastAPI가 Valkey에 두는 값이다. */
  readonly oauth: OAuthStore;
  /** 가짜 OAuth 서버(google, kakao, naver의 인가 코드와 프로필). */
  readonly oauthServer: OAuthServer;
  /** 파일 읽기 규칙, 참조 확인, 삭제 처리. 파일을 가리키는 모듈이 앱을 조립할 때 등록한다. */
  readonly fileRegistry: FileRegistry;
  /** 계정을 닫을 때(비활성화, 탈퇴) 부를 처리. auth가 앱을 조립할 때 등록한다. */
  readonly accountClosers: AccountCloser[];
  /** 역할의 권한이 바뀌거나 역할이 지워질 때 그 역할을 가진 사용자로 부를 처리. users가 등록한다. */
  readonly membersChanged: MembersChanged[];
}

export interface StateOptions {
  readonly clock?: Clock;
}

export function createState(options: StateOptions = {}): MockState {
  const clock = options.clock ?? systemClock();
  return {
    clock,
    store: createStore(),
    limiter: createRateLimiter(clock),
    realtime: createRealtimeHub(),
    realtimeTickets: createExpiringMap(clock),
    outbox: createOutbox(),
    storage: createStorage(clock),
    oauth: { states: createExpiringMap(clock), codes: createExpiringMap(clock) },
    oauthServer: createOAuthServer(clock),
    fileRegistry: createFileRegistry(),
    accountClosers: [],
    membersChanged: [],
  };
}
