# {{NAME}}

FastAPI와 Next.js BFF를 함께 개발하는 프로젝트다. Node 24, pnpm 12.6.0과 uv를 쓴다.

## 구조

| 경로                                    | 내용                                                        |
| --------------------------------------- | ----------------------------------------------------------- |
| `apps/api/`                             | FastAPI api·worker·scheduler, Python 잠금 파일, 개발 인프라 |
| `apps/web/`                             | Next.js BFF, 화면, TypeSpec·목 사본, HTTP 통합과 E2E        |
| `scripts/`                              | 루트 명령 실행기와 Node 내장 테스트                         |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | 두 앱과 web 계약 패키지의 workspace·잠금 파일               |
| `turbo.json`                            | 앱 실행 순서와 캐시                                         |

앱 규칙은 [api 지침](apps/api/AGENTS.md)과 [web 지침](apps/web/AGENTS.md)을 따른다.
루트 compose는 없다. 인프라는 `apps/api/compose.yaml`이 맡고 compose 프로젝트 이름은 `{{NAME}}`이다.

## 명령

| 명령                               | 하는 일                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `pnpm setup`                       | 도구 확인·frozen 설치 → 루트 hook 설치 → api setup → web setup |
| `pnpm dev`                         | api·worker·scheduler와 백엔드 모드 web을 함께 실행             |
| `pnpm check`                       | 루트 포맷·실행기 테스트·지침 → api check → web check           |
| `pnpm fix`                         | 앱 자동 수정과 루트 파일 포맷                                  |
| `pnpm test`                        | api와 web 테스트를 차례로 실행                                 |
| `pnpm test:e2e`                    | api E2E → api e2e:serve 위에서 web FastAPI E2E                 |
| `pnpm gen`                         | api OpenAPI 내보내기 → web 타입 생성                           |
| `pnpm db:migrate`, `pnpm db:reset` | api 마이그레이션·개발 DB 재설정                                |

setup·E2E·DB 명령은 캐시하지 않는다. gen도 생성물 누락을 피하도록 캐시하지 않는다.
dev 이외 앱 명령은 동시 실행 수 1로 돌린다. check 성공은 한 줄, 실패는 실패한 단계 출력만 보여 준다.

## 앱 사이 흐름

- 계약은 code-first다. api 코드를 바꾸면 `pnpm gen`으로 `apps/api/openapi.json`을 내보낸 다음 web 타입을 다시 만든다.
- web의 `gen.config.json`이 api OpenAPI를 선택한다. 생성물은 직접 고치지 않는다. check가 최신 여부를 확인한다.
- web의 TypeSpec·목 사본은 프론트 개발과 HTTP 통합 테스트의 대역이다. api 변경을 자동으로 따라가지 않는다. 실제 연결은 FastAPI E2E가 확인한다.
- web은 Server Component가 읽고 Server Action이 쓰는 BFF다. 브라우저 직접 연결은 실시간과 presigned PUT이다.
- 각 앱의 setup은 `.env.example`로 환경 키를 준비한다. `.env`는 읽거나 출력하지 않는다.
- api e2e:serve는 E2E DB `app_e2e`와 Valkey DB 14를 사용하고 받은 명령의 종료 코드로 끝난다. 개발 DB·Valkey DB 0을 사용하지 않는다.
- Mailpit과 스토리지 버킷은 개발 인프라를 함께 쓰며 Mailpit 전체를 비우지 않는다. web E2E Origin만 CORS에 더한다.

## 포트

| 용도                          | 포트                       |
| ----------------------------- | -------------------------- |
| web dev, api dev              | 3000, 8000                 |
| 목 dev, admin 예약            | 4010, 3001                 |
| PostgreSQL, Valkey, S3, SMTP  | 25432, 26379, 28333, 21025 |
| Mailpit 화면·API, 모의 OAuth  | 28025, 28080               |
| Grafana, OTLP gRPC·HTTP(선택) | 23000, 24317, 24318        |
| api E2E, web E2E, 목 E2E      | 18000, 3100, 4110          |

프로젝트 여러 개를 동시에 실행하면 고정 포트가 겹친다. 동시 실행은 지원하지 않는다.
compose 이름이 프로젝트마다 달라 볼륨은 섞이지 않는다.

## 하네스

- Claude Code를 루트에서 열면 두 앱의 권한과 hook을 합친 루트 설정을 쓴다. 앱 폴더에서 열면 그 앱의 설정을 쓴다.
- skill은 각 앱의 `.claude/skills/`에 둔다. 루트 세션도 앱 파일을 처음 읽거나 고칠 때 그 아래 skill을 불러온다.
- 루트 hook은 앱의 `.claude/settings.json`에서 exec form의 command hook을 매번 읽고 앱 폴더에서 실행한다.
- matcher·이벤트·권한을 바꾸면 루트 `.claude/settings.json`도 고친다. 앱 lefthook·Betterleaks 설정을 바꾸면 루트 `lefthook.yml`·`.betterleaks.toml`도 고친다. prompt hook은 루트 디스패처가 지원하지 않는다.
- 편집 hook은 고친 앱만, Stop은 바뀐 앱과 루트 검사만 돈다. 위험 명령은 두 앱이 검사하고 하나라도 거부하면 막는다. SessionStart는 앱별 상태를 함께 보여 준다.
- 앱 hook의 exit 2와 JSON deny·block은 차단한다. 일반 실패·실행 도구 누락·시간 초과는 고치는 방법과 함께 비차단 오류로 알린다.
- 루트 `lefthook.yml`이 커밋 전 앱 포맷·린트와 루트 포맷을 돌리고, 합친 `.betterleaks.toml`로 비밀을 한 번 스캔한다. 푸시 전에는 `pnpm check`를 돌린다.
- 루트와 앱 setup은 자기 폴더가 git 최상위일 때만 hook을 설치한다. 루트가 git 최상위가 아니면 Stop도 안내만 하고 통과한다. 루트에서 `git init` 후 다시 실행한다. 루트 `.mcp.json`은 web의 고정 MCP 서버를 쓴다.

## 완료 기준

`pnpm check` 통과가 완료 기준이다. 앱 내부 변경은 해당 앱의 지침과 문서를 읽고 검증한다.
web check·build·E2E는 산출물을 공유하므로 차례로 실행한다. 의존성은 정확한 버전으로 고정하고 minimumReleaseAge 1440을 유지한다.
로딩 상태는 스피너나 스켈레톤만 쓴다. 지침은 AGENTS.md에 두고 CLAUDE.md는 `@AGENTS.md` 한 줄이다.
루트 포맷은 루트 소유 파일·scripts·루트 hook만 검사한다. 앱은 자기 check로 검사한다.
