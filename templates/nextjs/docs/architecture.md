# 아키텍처

Next.js App Router의 BFF다. Server Component가 데이터를 읽고 Server Action이 쓴다.
브라우저는 백엔드 API를 직접 부르지 않는다. 실시간 Socket.IO와 presigned URL 업로드만 직접 연결한다.
API 계약·목 사본은 다음 단계에서 이 프로젝트의 `contract/` 안에 들어온다.

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

## 하네스

check는 단계별 입력 해시를 캐시한다. 삭제도 변경으로 본다. 실패한 단계는 캐시하지 않는다.
Stop은 세션 시작 또는 마지막 통과 때의 스냅샷과 비교하므로 셸 편집도 감지한다.
세션별 상태는 `.cache/hooks/`에만 두며 환경 파일·의존성·빌드 산출물은 읽지 않는다.
빠른 검사는 변경 관련 테스트를 쓰고, 전체 검사는 pre-push와 CI에서 쓴다.
생성물 검사와 E2E는 아직 대상이 없는 실행 지점이며 후속 단계에서 구현한다.

PreToolUse의 셸 검사는 단어 기반의 최선 검사다. 별도 프로그램 안에서 파일을 여는 동작까지 해석하지 않는다.
Hook JSON 형식의 기준은 [Claude Code 공식 문서](https://code.claude.com/docs/en/hooks)다.
