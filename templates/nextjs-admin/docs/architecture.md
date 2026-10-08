# 관리 BFF

서버가 API를 읽고 Server Action이 쓴다. 브라우저에는 계정 표시 정보만 전달한다. API 토큰은 JWE 세션 쿠키에 두며 proxy에서만 갱신한다. 여러 인스턴스에서는 갱신을 같은 프로세스로 보내는 sticky session이 필요하다.

로그인 직후 `/me`로 `admin:access`를 확인하고 일반 회원의 새 세션은 끝낸다. 보호 레이아웃은 요청마다 다시 확인한다. 실시간 `me.updated`가 레이아웃을 갱신하며 현재 세션이 폐기되면 로그인 화면으로 간다. 403·404·429는 번역한 안내를 같은 화면에 보인다.

언어는 ko/en이며 로그인 성공은 계정 언어를 따른다. 로그인 중 전환은 `/me`의 locale, `NEXT_LOCALE`, 현재 화면 URL을 함께 바꾼다. 쿠키는 host-only다. 소셜 계정은 비밀번호를 먼저 설정해야 이 앱에 로그인할 수 있다.

## 테스트

Vitest global setup이 실제 목 프로세스를 시작하고 `mockBaseUrl`을 제공한다. 요청 저장소를 대체한 Action 검사도 실제 HTTP API로 로그인·권한·폐기를 확인한다. E2E는 목(4111), 운영 admin(3101), 두 Chromium worker를 쓰며 실행기가 시작한 자원을 종료한다. 기존 포트의 서버는 재사용하거나 종료하지 않는다. 영상·스크린샷·trace는 저장하지 않는다.

## 실행과 이미지

환경 예시의 API와 실시간 주소는 목(4011)이다. `pnpm dev`는 HTTP loopback의 이 주소일 때 목도 시작한다. 실제 백엔드 주소면 admin만 시작한다. `pnpm build`에는 비밀이 필요 없다. 서버 시작과 instrumentation은 환경 스키마를 확인하고 운영 예시 비밀을 거절한다.

Docker 이미지는 `NEXT_OUTPUT=standalone`으로 빌드하며 `node server.js`와 포트 3001, UID/GID 10001로 실행한다. API·APP·실시간 URL과 새 세션 비밀은 실행 때 전달한다. healthcheck는 로그인 이동도 따라간다. 일반 운영·E2E는 standalone 설정 없이 `next start`를 쓴다.
