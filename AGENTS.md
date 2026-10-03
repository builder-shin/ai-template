# ai-template

AI 바이브코딩에 최적화한 프로젝트 템플릿(FastAPI, NestJS, Next.js, Next.js admin)을 만드는 저장소다.
설계는 `docs/superpowers/specs/2026-09-26-ai-template-foundation-design.md`를 따른다.
생성 CLI와 조합 구조는 `docs/superpowers/specs/2026-10-03-create-cli-design.md`를 따른다.

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
| `create/`               | git 추적 템플릿 파일로 단독·FastAPI+web 조합 프로젝트를 만드는 CLI                        |
| `create/assets/combo/`  | 조합 루트 실행기·하네스·CI와 조합용 web 이미지의 원본                                     |
| `scripts/`              | check 실행기, 도구 설치기, 구조 비교, 지침·템플릿 검사, 동기화                            |
| `docs/`                 | 하네스 표준, API 규약, 스펙과 계획                                                        |

## 명령

| 명령                                              | 하는 일                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                      | 완료 기준. 성공하면 한 줄, 실패하면 실패한 단계의 출력만 보여 준다                                                                                                                                                                                                                                |
| `pnpm fix`                                        | 포맷과 자동 수정 가능한 린트                                                                                                                                                                                                                                                                      |
| `pnpm gen`                                        | 계약을 컴파일하고 적합성 테스트와 목 서버의 타입을 다시 만든다                                                                                                                                                                                                                                    |
| `pnpm sync`                                       | 공유 자산 원본을 템플릿 사본 위치로 복사한다                                                                                                                                                                                                                                                      |
| `pnpm new <대상> --template <fastapi\|nextjs>`    | 저장소 밖에 단독 프로젝트를 만든다. `--name <이름>`, `--no-git`, `--help`를 지원한다                                                                                                                                                                                                              |
| `pnpm new <대상> --api fastapi --web`             | 저장소 밖에 apps/api·apps/web 조합을 만든다. web 의존성 버전을 보존하고 api OpenAPI로 web 타입을 생성한다. `--name`, `--no-git`를 지원한다                                                                                                                                                        |
| `pnpm new --help`                                 | 단독·조합 생성의 사용법과 이름 규칙을 보여 준다                                                                                                                                                                                                                                                   |
| `pnpm --dir templates/nextjs setup`               | web의 고정 의존성·Chromium 설치와 환경 준비                                                                                                                                                                                                                                                       |
| `pnpm --dir templates/nextjs dev`                 | 단독 모드의 web(3000)·목(4010), 백엔드 모드의 web                                                                                                                                                                                                                                                 |
| `pnpm --dir templates/nextjs check`               | web 자체 검사. 루트 check의 템플릿 구조·사본 검사와 함께 통과해야 한다                                                                                                                                                                                                                            |
| `pnpm --dir templates/nextjs test:e2e`            | 목(4110)과 운영 web(3100)에 붙는 Chromium E2E 20개. 기본 대상은 mock이며 FastAPI는 준비된 외부 주소·설정을 받는다                                                                                                                                                                                 |
| `pnpm web-e2e fastapi`                            | 전용 `ai-template-web-e2e-<ID>` 스택과 web(3100)에서 같은 E2E 20개를 실행한 뒤 그 스택·볼륨과 실행 이미지 `ai-template-web-e2e-fastapi:<ID>`를 정리한다. `--smoke`, `--print`, `--keep`, `--run-id <ID>`, `--down`은 [실행기 문서](scripts/src/web-e2e/README.md)를 따른다                        |
| `pnpm --dir templates/nextjs gen:feature <이름>`  | 골든 posts와 화면·번역·테스트를 복사하고 로그인 보호 경로를 등록한다                                                                                                                                                                                                                              |
| `pnpm --dir templates/nextjs gen`                 | TypeSpec 계약·목 타입과 web API·실시간·에러 타입 생성. web 타입은 선택한 `gen.config.json` 스펙을 사용한다                                                                                                                                                                                        |
| `pnpm tool <oasdiff\|betterleaks\|actionlint>`    | 버전을 고정한 바이너리를 받아 실행한다                                                                                                                                                                                                                                                            |
| `pnpm spec-compare [--subset] <계약> <구현>`      | 백엔드 스펙이 계약과 이름·경로·operation별 응답 상태·실시간 선언이 같고 계약을 깨지 않는지 본다. `--subset`은 구현 도중에 구현한 operation만 비교한다                                                                                                                                             |
| `pnpm conformance <대상> [--keep] [흐름 파일...]` | 대상을 띄우고 적합성 흐름 테스트를 돌린 뒤 내린다. `fastapi`는 compose로 띄우고(Docker 필요) 템플릿의 개발 인프라와 같은 compose 프로젝트를 써서 개발 DB에 마이그레이션과 시드를 실행한다(끝나면 개발 인프라도 내려간다). `mock`은 목 서버를 로컬 프로세스로 띄운다. 흐름 파일을 주면 그것만 돈다 |

## 규칙

- 작업을 끝내기 전에 `pnpm check`를 통과시킨다.
- `pnpm new`는 저장소 밖의 새 폴더 또는 비어 있는 폴더에 만든다. 상대 대상은 명령을 실행한 폴더 기준이다. Windows 저장소 경로의 대소문자 차이는 허용하며 없는 드라이브·공유는 생성 전에 거절한다. 이름은 대상 폴더 이름 또는 `--name`이며 소문자로 시작하는 kebab-case, 50자 이하다.
- FastAPI 단독·조합의 이름 `fastapi`는 템플릿의 개발 compose 이름이라 예약한다. 폴더 이름·`--name` 모두 오류 2로 거절하며 다른 `--name`을 쓴다. 단독 nextjs는 허용한다. 다른 로컬 compose 프로젝트와도 이름이 겹치지 않게 고른다. 같은 이름은 볼륨을 공유한다.
- 조합의 이름 `api`·`web`은 앱의 workspace 패키지 이름이라 예약한다. 폴더 이름·`--name` 모두 오류 2로 거절하며 다른 `--name`을 쓴다. 단독 프로젝트는 두 이름을 허용한다.
- FastAPI 템플릿 compose에는 최상위 `name`을 두지 않는다. CLI가 생성할 때 맨 앞에 설명 주석과 `name: <이름>`을 넣고 앱 이미지 값의 바이트 범위만 바꾼다.
- 생성할 템플릿과 조합 자산·루트 `.gitattributes`·`.editorconfig`의 git 추적 변경은 먼저 커밋한다. 조합 입력은 HEAD의 추적 내용을 쓴다. CLI는 추적 파일만 복사하고 `template.json`, 무추적 환경 파일·설치물·캐시는 제외하며 원본 인덱스의 실행 권한을 보존한다. CLI와 테스트의 git 호출은 `scripts/src/files/git-environment.ts`로 상속된 저장소 지정 변수를 제거한다.
- 조합 생성은 레지스트리에 접속해 잠금 파일을 합치고 frozen 설치·web gen을 실행한다. TypeScript override와 web 버전 해석을 보존한다. 루트 compose는 없고 인프라는 apps/api가 맡는다. gen은 캐시하지 않는다.
- 기본 생성은 main 브랜치와 출처를 적은 첫 커밋을 만든다. 복사한 파일은 이름 목록으로 강제 추가하고 조합이 만든 파일은 프로젝트 ignore를 따르므로 설치물·캐시는 제외한다. git 신원이 없으면 init과 스테이징 뒤 commit 명령을 안내하며 사용자 서명 설정을 따른다. `--no-git`은 git 초기화와 커밋을 모두 생략한다.
- 생성 smoke는 OS 임시 폴더의 `aitpl-` 이름을 쓴다. Docker가 필요한 생성 프로젝트 setup·FastAPI check·조합 E2E·이미지 빌드는 PR CI의 `create-combo`·`create-standalone`에서 확인한다. 개발 스택 `fastapi`·`joon`과 볼륨은 쓰거나 내리지 않는다.
- `.env`를 읽거나 출력하지 않는다. 키와 공개 기본값은 `.env.example`에서 확인한다.
- 계약은 `contract/typespec/src/`만 고치고 `pnpm gen`으로 생성물을 만든다. `contract/openapi.yaml`과 `**/generated/**`는 직접 고치지 않는다.
- API 규약은 `docs/conventions/jsonapi.md`, 에러 코드는 `docs/conventions/error-codes.md`를 따른다.
- 템플릿은 저장소의 다른 폴더를 참조하지 않는다. 공유 자산은 원본을 고친 뒤 `pnpm sync`한다.
- web 계약의 원본·사본 편집 순서는 [web 계약 동기화](docs/conventions/web-contract.md)를 따른다. 템플릿 레시피는 독립 프로젝트의 절차다.
- 템플릿은 `docs/harness/standard.md`를 지킨다. `pnpm check`가 `templates/`를 검사한다.
- web 규칙은 `templates/nextjs/AGENTS.md`, W1~W4 구현·검증 기록은 `docs/superpowers/specs/2026-09-30-nextjs-web-design.md`를 읽는다. web의 check·build·mock E2E·FastAPI E2E는 빌드 산출물을 함께 쓰므로 순서대로 실행한다. W4의 CI는 PR CI에서 확인한다.
- web의 FastAPI E2E는 루트 `pnpm web-e2e fastapi`로 실행한다. 포트를 먼저 검사하고 전용 compose·새 볼륨만 쓴다. 같은 실행 ID의 컨테이너나 볼륨이 있으면 기동·정리를 거부한다. 성공 뒤와 `--down`은 해당 스택·볼륨·정확한 실행 이미지 태그를 정리하며 없는 프로젝트·이미지도 성공이다. 개발 프로젝트 `fastapi`·`joon`은 건드리지 않는다. `pnpm conformance fastapi`는 개발 스택을 사용하므로 이 검증의 대체 명령이 아니다.
- 실행기의 `ps`·로그 진단은 실패·중단 때만 출력한다. FastAPI access log는 모든 환경에서 쿼리 문자열을 뺀다. POSIX 중단은 소유한 프로세스 그룹에 SIGINT를 보내고 30초 안에 끝나지 않으면 SIGKILL로 종료한다. 정리 중 신호도 종료 코드에 반영한다.
- 검사를 더하려면 루트 package.json에 `check:<이름>` 스크립트를 추가한다. 워크스페이스 패키지는 자기 `check` 스크립트만 두면 자동으로 포함된다.
- 커밋 전 hook이 포맷·린트·비밀 스캔을 돌린다. 테스트용 가짜 비밀은 줄 끝에 `betterleaks:allow` 주석을 단다.
