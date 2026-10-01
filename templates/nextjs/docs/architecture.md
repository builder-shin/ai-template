# 아키텍처

Next.js App Router의 BFF다. Server Component가 데이터를 읽고 Server Action이 쓴다.
브라우저는 백엔드 API를 직접 부르지 않는다. 실시간 Socket.IO와 presigned URL 업로드만 직접 연결한다.
API 계약·목 사본은 이 프로젝트의 `contract/` 안에 두고 자체 workspace로 실행한다.

## 경계

화면은 `features/<기능>/index.ts`, `lib`, `components`를 쓴다. 기능끼리도 공개 인터페이스만 쓴다.
공통 기반은 기능에 의존하지 않는다. ESLint 경계 규칙이 상대 경로·재수출·동적 import에도 적용된다.
API·세션과 기능 actions/queries는 `server-only` 표식이 없으면 린트가 실패한다.

## 설정과 실행

`next.config.ts` 설정 함수가 개발·운영 서버 phase에서만 Zod 스키마를 검증한다.
빌드·타입 생성에서는 검증하지 않으므로 서버 비밀 없이 빌드할 수 있다.
서버 시작 때 틀린 변수는 변수마다 한 줄을 표준 오류에 쓰고 값·스택 없이 종료 코드 1로 멈춘다.
운영 서버는 예시 `SESSION_SECRET`을 거절한다. 빌드의 `NODE_ENV=production`만으로 서버 검증을 실행하지 않는다.
`setup`이 의존성과 환경 파일을 준비한다. 기존 값은 보존하고 예시에서 새 키만 더한다.
API 기본 주소는 `http://localhost:4010/api/v1`, Socket.IO는 `http://localhost:4010`이다.
web은 3000에서 뜬다. 현재 `dev`는 web만 띄운다. 목 사본을 넣는 단계에서 함께 실행한다.

## 세션 설계

인증 단계에서는 access/refresh 토큰을 암호화한 쿠키에 보관하고, 갱신은 proxy 한 곳에서만 한다.
동시 갱신 묶기는 프로세스 안에서만 유효하다. 기본 배포는 인스턴스 하나다.
여러 인스턴스에서는 sticky session이 필요하며, 인스턴스를 넘는 갱신 조율은 별도 설계 대상이다.

## 로케일과 시간대

화면은 `src/app/[locale]/`에 둔다. `src/proxy.ts`의 next-intl middleware는 ko의 접두사를 없애고 en에 `/en`을 붙인다. URL, `NEXT_LOCALE` 쿠키, `Accept-Language`, 기본 ko 순으로 로케일을 고른다. 헤더와 다른 언어를 선택하면 middleware가 쿠키를 갱신한다. 헤더와 같은 첫 선택에는 불필요한 쿠키를 쓰지 않는다. 계정 로케일 동기화는 인증 단계에서 연결한다.

`src/lib/i18n/request.ts`는 선택한 카탈로그와 `TIME_ZONE`을 반환한다. 레이아웃은 같은 메시지와 시간대를 `NextIntlClientProvider`에 전달한다. 서버의 `getFormatter`와 클라이언트의 `useFormatter`를 써서 호스트 시간대 차이에 따른 날짜 불일치를 막는다. 기본 시간대는 `Asia/Seoul`이다.

`AppConfig`의 메시지 타입은 `messages/ko.json`에서 파생한다. 없는 번역 키는 컴파일 오류이며, check의 i18n 단계는 ko/en의 키와 생성된 모든 ErrorCode의 번역을 검사한다. 에러 코드는 `errors` 아래 영역별 객체로 두고 `getTranslations("errors")`에 코드와 `meta.params`를 넘겨 ICU 값을 치환한다. API 에러 매핑은 다음 단계에서 붙인다.

## 하네스

check는 단계별 입력 해시를 캐시한다. 삭제도 변경으로 본다. 실패한 단계는 캐시하지 않는다.
Stop은 세션 시작 또는 마지막 통과 때의 스냅샷과 비교하므로 셸 편집도 감지한다.
세션별 상태는 `.cache/hooks/`에만 두며 환경 파일·의존성·빌드 산출물은 읽지 않는다.
빠른 검사는 변경 관련 테스트를 쓰고, 전체 검사는 pre-push와 CI에서 쓴다.
생성물 검사는 TypeSpec 계약과 web·목 타입을 재생성해 비교한다. E2E 흐름은 후속 단계에서 구현한다.

PreToolUse의 셸 검사는 단어 기반의 최선 검사다. 별도 프로그램 안에서 파일을 여는 동작까지 해석하지 않는다.
Hook JSON 형식의 기준은 [Claude Code 공식 문서](https://code.claude.com/docs/en/hooks)다.

## 계약과 단독 개발

`contract/*`는 pnpm workspace다. 목의 `@ai-template/contract`는 TypeSpec 사본으로 연결되고 두 패키지는 루트 `tsconfig.base.json`과 고정된 개발 도구를 사용한다. API 규약도 `docs/conventions/`에 함께 복사해 계약 테스트와 AI가 같은 문서를 읽는다.

`pnpm gen`은 TypeSpec을 컴파일하고 API 선언, 실시간 이벤트 이름·payload 매핑, 에러 코드 목록과 목 타입을 다시 만든다. `pnpm check`는 임시 디렉터리의 생성 결과를 비교하고 계약 두 패키지의 자체 검사도 돌린다. 사본은 원본 포맷을 보존하므로 web 포맷·린트에서 제외한다.

`pnpm dev`는 Next 환경 로더로 설정을 준비한다. API 주소가 HTTP loopback의 4010 `/api/v1`이면 목과 web을 함께 시작하며, 외부 백엔드 주소라면 web만 시작한다. 어느 자식이 종료하거나 Ctrl+C를 받으면 자신이 시작한 프로세스 트리를 함께 내린다.
