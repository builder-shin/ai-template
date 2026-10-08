# 관리 인증

- 로그인 발급 직후 실제 `/me`의 `meta.permissions`를 읽는다. 일반 회원의 새 세션은 끝내고 쿠키를 쓰지 않는다.
- 서버 레이아웃은 매 요청의 `requireAdmin`으로 접근을 확인한다. React 캐시는 요청 안의 중복 조회만 묶는다.
- `actions.ts`·`account.ts`는 server-only다. 토큰을 클라이언트 props·URL·로그에 전달하지 않는다.
- 로케일 전환은 계정·쿠키·URL을 함께 맞춘다. 로그아웃은 API 실패에도 쿠키를 지운다.
- [관리 BFF](../../../docs/architecture.md), [실제 목 Action 검사](../../../scripts/admin-auth.integration.test.ts)를 따른다.
