# 관리 BFF

서버가 API를 읽고 Server Action이 쓴다. 브라우저에는 계정 표시 정보만 전달한다. API 토큰은 JWE 세션 쿠키에 두며 proxy에서만 갱신한다. 여러 인스턴스에서는 갱신을 같은 프로세스로 보내는 sticky session이 필요하다.

로그인 직후 `/me`로 `admin:access`를 확인하고 일반 회원의 새 세션은 끝낸다. 보호 레이아웃은 요청마다 다시 확인한다. 실시간 `me.updated`가 레이아웃을 갱신하며 현재 세션이 폐기되면 로그인 화면으로 간다. 403·404·429는 번역한 안내를 같은 화면에 보인다.

언어는 ko/en이며 로그인 성공은 계정 언어를 따른다. 로그인 중 전환은 `/me`의 locale, `NEXT_LOCALE`, 현재 화면 URL을 함께 바꾼다. 쿠키는 host-only다. 소셜 계정은 비밀번호를 먼저 설정해야 이 앱에 로그인할 수 있다.

## 리소스

`src/resources/index.ts`가 선언을 메뉴 순서로 공개한다. 홈은 첫 허용 리소스로 이동한다. `(admin)/[type]`의 목록·상세·생성·수정은 선언이 있는 화면만 연다. 현재 제품 등록은 posts 하나이며 작성·수정은 제공하지 않는다.

`src/lib/resources/`는 생성 계약 타입·권한·URL 쿼리·JSON:API 쓰기를 처리하는 server-only 계층이다. `src/components/resource/`는 서버 화면 구성과 DOM 부품을 나눈다. 목록은 선언한 필터·sort·include와 크기 20의 페이지를 쓰고 관계 옵션의 403은 해당 필터만 비활성화한다. 쓰기는 선언한 필드만 보내며 Server Action이 권한·최신 조건을 다시 검사한다.

최상위 fields는 표시·enum values·관계 대상·필드 override, create·edit의 fields는 입력 종류다. `resource-messages`가 등록 선언의 title·fields·enums·actions를 ko/en에서 확인한다. `pnpm gen:resource <type>`은 계약에서 수정 가능한 초안을 만들고 기존 선언은 덮지 않는다. [리소스](recipes/add-resource.md)·[필드 종류](recipes/add-field-kind.md)·[동작](recipes/add-action.md) 레시피를 따른다.

채널을 선언한 목록·상세는 기존 RealtimeProvider로 구독하며 첫 이벤트부터 100ms 동안 받은 이벤트를 refresh 한 번으로 묶는다. 채널 변경·unmount는 예약을 취소한다. 글 채널은 posts:all이다.

## 테스트

Vitest global setup이 실제 목 프로세스를 시작하고 `mockBaseUrl`을 제공한다. 요청 저장소를 대체한 Action 검사도 실제 HTTP API로 로그인·권한·폐기를 확인한다. E2E는 목(4111), 운영 admin(3101), 두 Chromium worker를 쓰며 실행기가 시작한 자원을 종료한다. 기존 포트의 서버는 재사용하거나 종료하지 않는다. 영상·스크린샷·trace는 저장하지 않는다.

Chromium 시나리오는 11개다. 인증·권한 상실·언어 5개와 글 목록·동작·삭제·목록/상세 실시간·부분 권한·404 6개를 검사한다. 일반 회원은 가입·목 메일 인증 API로 만들고 일부 권한 관리자는 시드 관리자가 역할을 부여한다. 시드 계정은 브라우저 로그인 주체로 쓰지 않는다. 사용자·역할·권한·감사 로그 제품 화면과 FastAPI 대상 확장은 후속 범위다.

## 실행과 이미지

환경 예시의 API와 실시간 주소는 목(4011)이다. `pnpm dev`는 HTTP loopback의 이 주소일 때 목도 시작한다. 실제 백엔드 주소면 admin만 시작한다. `pnpm build`에는 비밀이 필요 없다. 서버 시작과 instrumentation은 환경 스키마를 확인하고 운영 예시 비밀을 거절한다.

Docker 이미지는 `NEXT_OUTPUT=standalone`으로 빌드하며 `node server.js`와 포트 3001, UID/GID 10001로 실행한다. API·APP·실시간 URL과 새 세션 비밀은 실행 때 전달한다. healthcheck는 로그인 이동도 따라간다. 일반 운영·E2E는 standalone 설정 없이 `next start`를 쓴다.
