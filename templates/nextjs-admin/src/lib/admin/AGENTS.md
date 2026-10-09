# 관리 인증

- password grant 발급 직후 실제 `/me`의 `meta.permissions`를 읽는다. `admin:access`가 없는 회원의 새 세션은 끝내고 세션·`NEXT_LOCALE` 쿠키를 쓰지 않는다. 발급 뒤 실패한 세션도 끝낸다.
- 로그인 페이지는 `safeLoginReturnTo`로 검증한 `returnTo`를 `loginAction(returnTo, state, data)`에 바인딩한다. Action도 같은 검사를 반복한다. permalink는 `loginPath(returnTo, locale)`, 성공은 `loginDestination(returnTo, accountLocale)`다. 실패·회원 거절은 복귀 쿼리를 유지하고 외부·모호한 값과 로그인·세션 정리 경로는 `/`로 돌아간다.
- 서버 레이아웃과 관리 홈은 매 요청의 `requireAdmin`으로 접근을 확인한다. React 캐시는 요청 안의 중복 조회만 묶는다. `/forbidden`은 `getAccount`만 쓴다.
- `actions.ts`·`account.ts`는 server-only다. 토큰을 클라이언트 props·URL·로그에 전달하지 않는다.
- 로케일 전환은 계정·host-only `NEXT_LOCALE`·URL을 함께 맞춘다. 실패한 4xx는 폼 상태로 돌려주고 쿠키를 유지한다. 로그아웃은 API 실패에도 쿠키를 지우고 같은 언어의 로그인 화면으로 간다.
- 401은 `redirectOnUnauthorized`, 그 밖의 4xx는 `RequestNotice`로 번역한다. 429는 `Retry-After`도 보인다. 서버 오류와 Next 제어 흐름은 다시 던진다.
- 소셜로만 가입해 비밀번호가 없는 계정은 web에서 비밀번호를 설정하거나 다른 관리자 계정을 쓴다.
- [관리 BFF](../../../docs/architecture.md), [실제 목 Action 검사](../../../scripts/admin-auth.integration.test.ts)를 따른다.
