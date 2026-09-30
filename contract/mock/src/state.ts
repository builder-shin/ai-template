/**
 * 목의 메모리 상태. 데이터는 프로세스 메모리에 있고 재시작하면 처음으로 돌아간다.
 * 모듈을 더하면(저장소, 가짜 스토리지, 실시간) 여기에 더하고 createState에서 만든다.
 */

import { createOutbox, type Outbox } from "./mail/outbox.ts";

export interface MockState {
  /** 보낸 메일 보관함. */
  readonly outbox: Outbox;
}

export function createState(): MockState {
  return { outbox: createOutbox() };
}
