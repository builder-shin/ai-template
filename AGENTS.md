# ai-template

AI 바이브코딩에 최적화한 프로젝트 템플릿(FastAPI, NestJS, Next.js, Next.js admin)을 만드는 저장소다.
설계는 `docs/superpowers/specs/2026-09-26-ai-template-foundation-design.md`를 따른다.

## 구조

| 경로                    | 내용                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `contract/typespec/`    | 플랫폼 API 계약 원본(TypeSpec)                                                            |
| `contract/openapi.yaml` | 계약 컴파일 결과. 생성물이라 직접 고치지 않는다                                           |
| `contract/api-style/`   | JSON:API 룰셋(Redocly). 백엔드 템플릿이 사본으로 쓴다                                     |
| `contract/conformance/` | 두 백엔드와 목에 똑같이 돌리는 적합성 테스트 틀                                           |
| `contract/mock/`        | 플랫폼 API를 메모리로 구현한 목 서버(Hono). 단독 web의 개발 백엔드이자 적합성 `mock` 대상 |
| `templates/`            | 템플릿. 각 폴더는 그대로 복사하면 동작하는 독립 프로젝트다                                |
| `templates/fastapi/`    | FastAPI 백엔드 템플릿                                                                     |
| `templates/nextjs/`     | Next.js BFF web. 자체 workspace의 계약·목과 인증·글·내 정보·세션·업로드·실시간 기능       |
| `scripts/`              | check 실행기, 도구 설치기, 구조 비교, 지침·템플릿 검사, 동기화                            |
| `docs/`                 | 하네스 표준, API 규약, 스펙과 계획                                                        |

## 명령

| 명령                                              | 하는 일                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                      | 완료 기준. 성공하면 한 줄, 실패하면 실패한 단계의 출력만 보여 준다                                                                                                                                                                                                                                |
| `pnpm fix`                                        | 포맷과 자동 수정 가능한 린트                                                                                                                                                                                                                                                                      |
| `pnpm gen`                                        | 계약을 컴파일하고 적합성 테스트와 목 서버의 타입을 다시 만든다                                                                                                                                                                                                                                    |
| `pnpm sync`                                       | 공유 자산 원본을 템플릿 사본 위치로 복사한다                                                                                                                                                                                                                                                      |
| `pnpm --dir templates/nextjs setup`               | web의 고정 의존성·Chromium 설치와 환경 준비                                                                                                                                                                                                                                                       |
| `pnpm --dir templates/nextjs dev`                 | 단독 모드의 web(3000)·목(4010), 백엔드 모드의 web                                                                                                                                                                                                                                                 |
| `pnpm --dir templates/nextjs check`               | web 자체 검사. 루트 check의 템플릿 구조·사본 검사와 함께 통과해야 한다                                                                                                                                                                                                                            |
| `pnpm --dir templates/nextjs test:e2e`            | 목(4110)과 운영 web(3100)에 붙는 Chromium 인증·기능 E2E. 기본 대상은 mock이며 FastAPI는 W4                                                                                                                                                                                                        |
| `pnpm --dir templates/nextjs gen:feature <이름>`  | 골든 posts와 화면·번역·테스트를 복사하고 로그인 보호 경로를 등록한다                                                                                                                                                                                                                              |
| `pnpm --dir templates/nextjs gen`                 | web 사본의 TypeSpec 계약과 API·실시간·에러·목 타입 생성                                                                                                                                                                                                                                           |
| `pnpm tool <oasdiff\|betterleaks>`                | 버전을 고정한 바이너리를 받아 실행한다                                                                                                                                                                                                                                                            |
| `pnpm spec-compare [--subset] <계약> <구현>`      | 백엔드 스펙이 계약과 이름·경로·operation별 응답 상태·실시간 선언이 같고 계약을 깨지 않는지 본다. `--subset`은 구현 도중에 구현한 operation만 비교한다                                                                                                                                             |
| `pnpm conformance <대상> [--keep] [흐름 파일...]` | 대상을 띄우고 적합성 흐름 테스트를 돌린 뒤 내린다. `fastapi`는 compose로 띄우고(Docker 필요) 템플릿의 개발 인프라와 같은 compose 프로젝트를 써서 개발 DB에 마이그레이션과 시드를 실행한다(끝나면 개발 인프라도 내려간다). `mock`은 목 서버를 로컬 프로세스로 띄운다. 흐름 파일을 주면 그것만 돈다 |

## 규칙

- 작업을 끝내기 전에 `pnpm check`를 통과시킨다.
- 계약은 `contract/typespec/src/`만 고치고 `pnpm gen`으로 생성물을 만든다. `contract/openapi.yaml`과 `**/generated/**`는 직접 고치지 않는다.
- API 규약은 `docs/conventions/jsonapi.md`, 에러 코드는 `docs/conventions/error-codes.md`를 따른다.
- 템플릿은 저장소의 다른 폴더를 참조하지 않는다. 공유 자산은 원본을 고친 뒤 `pnpm sync`한다.
- web 계약의 원본·사본 편집 순서는 [web 계약 동기화](docs/conventions/web-contract.md)를 따른다. 템플릿 레시피는 독립 프로젝트의 절차다.
- 템플릿은 `docs/harness/standard.md`를 지킨다. `pnpm check`가 `templates/`를 검사한다.
- web 규칙은 `templates/nextjs/AGENTS.md`, 설계와 W3 완료·W4 항목은 `docs/superpowers/specs/2026-09-30-nextjs-web-design.md`를 읽는다. web의 check·build·E2E는 빌드 산출물을 함께 쓰므로 순서대로 실행한다.
- 검사를 더하려면 루트 package.json에 `check:<이름>` 스크립트를 추가한다. 워크스페이스 패키지는 자기 `check` 스크립트만 두면 자동으로 포함된다.
- 커밋 전 hook이 포맷·린트·비밀 스캔을 돌린다. 테스트용 가짜 비밀은 줄 끝에 `betterleaks:allow` 주석을 단다.
