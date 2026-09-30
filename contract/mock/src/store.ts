/**
 * 목의 저장소. FastAPI 템플릿의 DB 테이블을 메모리에 같은 모양으로 둔다. 행의 모양은 테이블을 가진
 * 모듈의 model.ts가 정하고, 읽고 쓰는 함수도 그 모듈에 둔다(다른 모듈은 그 함수를 부른다).
 *
 * - 목의 처리는 한 요청 안에서 await 없이 끝나므로 트랜잭션이 필요 없다. 여러 행을 바꾸는 처리는
 *   검사를 모두 마친 뒤에 바꾼다(FastAPI에서 예외가 나면 롤백되는 것과 같은 결과가 되게).
 * - 모듈을 더하면(posts 등) 그 모듈의 테이블을 여기에 더하고 createStore에서 만든다.
 */

import type { AuditLogRow } from "./core/audit.ts";
import type {
  AccessTokenRow,
  AccountTokenRow,
  LoginSessionRow,
  RefreshTokenRow,
} from "./modules/auth/model.ts";
import type { FileRow } from "./modules/files/model.ts";
import type { RoleRow } from "./modules/roles/model.ts";
import type { UserRow } from "./modules/users/model.ts";

export interface Store {
  /** 사용자. 키는 id다. */
  readonly users: Map<string, UserRow>;
  /** 역할. 키는 id다. */
  readonly roles: Map<string, RoleRow>;
  /** 사용자-역할 연결. 키는 사용자 id, 값은 역할 id다. */
  readonly userRoles: Map<string, Set<string>>;
  /** 로그인 세션. 키는 id다. */
  readonly sessions: Map<string, LoginSessionRow>;
  /** refresh token. 키는 토큰의 digest다. */
  readonly refreshTokens: Map<string, RefreshTokenRow>;
  /** access token. 키는 토큰의 digest다. */
  readonly accessTokens: Map<string, AccessTokenRow>;
  /** 1회용 계정 토큰. 키는 토큰의 digest다. */
  readonly accountTokens: Map<string, AccountTokenRow>;
  /** 파일(메타데이터). 키는 id다. 객체는 가짜 스토리지(MockState.storage)에 있다. */
  readonly files: Map<string, FileRow>;
  /** 감사 로그. 기록한 순서다. */
  readonly auditLogs: AuditLogRow[];
}

export function createStore(): Store {
  return {
    users: new Map(),
    roles: new Map(),
    userRoles: new Map(),
    sessions: new Map(),
    refreshTokens: new Map(),
    accessTokens: new Map(),
    accountTokens: new Map(),
    files: new Map(),
    auditLogs: [],
  };
}
