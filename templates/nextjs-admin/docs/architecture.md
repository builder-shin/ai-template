# 관리 BFF

서버가 API를 읽고 Server Action이 쓴다. 브라우저에는 계정 표시 정보만 전달한다. API 토큰은 JWE 세션 쿠키에 두며 proxy에서만 갱신한다. 여러 인스턴스에서는 갱신을 같은 프로세스로 보내는 sticky session이 필요하다.

비밀번호 로그인은 `POST /sessions`의 password grant 뒤 발급 토큰으로 `/me`를 읽는다. `admin:access`가 없으면 새 세션을 끝내고 세션·`NEXT_LOCALE` 쿠키를 쓰지 않는다. 발급 뒤 실패한 세션도 정리한다. 보호 레이아웃과 관리 홈은 요청마다 다시 확인하며 React 캐시는 요청 안의 중복 조회만 묶는다. `/forbidden`은 권한 판정 밖에서 계정을 읽어 메뉴 없는 레이아웃과 로그아웃을 보인다.

실시간 `me.updated`가 화면을 갱신해 접근 권한을 다시 확인한다. 현재 세션의 `session.revoked`는 401 확인 뒤 로그인 화면으로 보내며 다른 세션의 폐기는 무시한다. 로그아웃은 API 실패에도 브라우저 쿠키를 지우고 같은 언어의 로그인 화면으로 간다. 401은 쿠키 정리 route를 거쳐 로그인으로 보내고 그 밖의 모든 4xx는 `RequestNotice`로 같은 화면에 번역한다. 429는 `Retry-After`도 보인다. 서버 오류와 Next 이동·404 제어 흐름은 다시 던진다.

언어는 ko/en이며 로그인 성공은 계정 언어를 따른다. 로그인 중 전환은 `/me`의 locale, `NEXT_LOCALE`, 현재 화면 URL을 함께 바꾼다. 쿠키는 host-only다. 소셜 계정은 비밀번호를 먼저 설정해야 이 앱에 로그인할 수 있다.

## 테스트

Vitest global setup이 실제 목 프로세스를 시작하고 `mockBaseUrl`을 제공한다. 요청 저장소를 대체한 Action 검사도 실제 HTTP API로 로그인·권한·폐기를 확인한다. 앱 번역 테스트는 `scripts/test/intl-fixture.ts`로 환경 스키마의 시간대를 고정한다. E2E 5개는 목(4111), 운영 admin(3101), 두 Chromium worker로 인증·권한·언어를 확인하며 실행기가 시작한 자원을 종료한다. 기존 포트의 서버는 재사용하거나 종료하지 않는다. 영상·스크린샷·trace는 저장하지 않는다.

## 실행과 이미지

환경 예시의 API와 실시간 주소는 목(4011)이다. `pnpm dev`는 HTTP loopback의 이 주소일 때 목도 시작한다. 실제 백엔드 주소면 admin만 시작한다. `pnpm build`에는 비밀이 필요 없다. 서버 시작과 instrumentation은 환경 스키마를 확인하고 운영 예시 비밀을 거절한다.

Docker 이미지는 `NEXT_OUTPUT=standalone`으로 빌드하며 `node server.js`와 포트 3001, UID/GID 10001로 실행한다. API·APP·실시간 URL과 새 세션 비밀은 실행 때 전달한다. healthcheck는 로그인 이동도 따라간다. 일반 운영·E2E는 standalone 설정 없이 `next start`를 쓴다.
