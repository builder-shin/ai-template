# 하네스 표준

모든 템플릿이 지켜야 하는 AI 바이브코딩 하네스다. 원칙은 **문서는 짧게, 규칙은 기계가 강제**다. `pnpm check:templates`(`scripts/src/verify-templates`)가 이 문서의 [검사 목록](#verify-templates가-검사하는-것)을 템플릿마다 확인한다.

## 지침 파일

- `AGENTS.md`가 규칙의 단일 원본이다. 루트 AGENTS.md는 200줄 이하로, 명령·구조 지도·핵심 규칙·완료 기준·문서 링크만 담는다.
- 폴더별 규칙은 그 폴더의 `AGENTS.md`에 둔다. Claude Code는 그 폴더의 파일을 읽을 때 불러온다.
- 모든 `AGENTS.md` 옆에 `@AGENTS.md` 한 줄짜리 `CLAUDE.md`를 둔다. 루트 CLAUDE.md만 import 뒤에 Claude 전용의 짧은 내용을 더할 수 있다.
  - 근거: Claude Code(v2.1.277+)는 경로에 CLAUDE.md가 없을 때만 AGENTS.md를 직접 읽고, 일부 세션은 아예 읽지 못한다. import는 모든 세션에서 동작하고 두 번 읽지 않는다. Windows에서는 심볼릭 링크 대신 import를 쓴다.
- `.claude/rules/`는 쓰지 않는다(규칙 원본이 둘이 되므로).
- 긴 설명과 절차는 `docs/`(아키텍처, 레시피, 규약)에 두고 AGENTS.md에서 링크한다.
- 프레임워크가 에이전트 문서에 자동으로 써 넣는 내용(예: Next.js 16.3의 관리 블록)은 우리 규칙과 섞이지 않게 처리한다.

## template.json

템플릿 루트에 둔다. verify-templates는 이 값으로 템플릿 종류에 맞는 검사를 고른다.

```json
{
  "name": "web",
  "kind": "frontend",
  "runner": "pnpm",
  "goldenModule": "src/features/posts"
}
```

| 필드           | 값                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `name`         | `templates/` 아래 폴더 이름                                                                               |
| `kind`         | `backend` 또는 `frontend`                                                                                 |
| `runner`       | `pnpm`(package.json scripts) 또는 `uv`(`pyproject.toml`의 `[tool.poe.tasks]`, 실행은 `uv run poe <명령>`) |
| `goldenModule` | 골든 모듈 `posts`의 경로                                                                                  |

## 명령 어휘

| 명령         | 의미                                                                         | 대상   |
| ------------ | ---------------------------------------------------------------------------- | ------ |
| `setup`      | 의존성 설치, 인프라 기동, 마이그레이션, 시드. 여러 번 실행해도 안전하다      | 모두   |
| `dev`        | 개발 서버. 백엔드는 api·worker·scheduler, 프론트는 단독 모드에서 목 서버도   | 모두   |
| `check`      | 포맷, 린트, 타입, 테스트(E2E 제외), 생성물 최신 여부, 계약 린트, 하네스 검사 | 모두   |
| `fix`        | 포맷과 자동 수정 가능한 린트                                                 | 모두   |
| `test`       | 테스트(E2E 제외)                                                             | 모두   |
| `test:e2e`   | E2E                                                                          | 모두   |
| `e2e:serve`  | E2E 백엔드를 띄우고 받은 명령을 실행한 뒤 내린다. 조합 프로젝트의 web E2E용  | 백엔드 |
| `gen`        | 코드 생성(OpenAPI 내보내기, 클라이언트·타입, ORM 클라이언트)                 | 모두   |
| `db:migrate` | 마이그레이션 적용                                                            | 백엔드 |
| `db:reset`   | 로컬 DB를 마이그레이션과 시드 상태로 되돌린다                                | 백엔드 |

- 완료 기준은 `check` 통과 하나다.
- `check`의 빠른 경로(포맷, 린트, 타입, 변경 관련 테스트, 생성물 최신 여부)는 Stop hook이 쓰고, 전체 `check`는 pre-push와 CI가 돌린다.
- 인프라가 필요한 테스트 전에 인프라가 떠 있는지 확인하고, 꺼져 있으면 "`setup`을 실행하라"며 바로 실패한다.
- 출력: 성공은 한 줄, 실패는 `파일:줄 규칙 — 고치는 방법`. 커스텀 규칙의 메시지는 "대신 이렇게 하라"로 쓴다.

## 기계적 강제

| 대상      | 장치                                                                                       |
| --------- | ------------------------------------------------------------------------------------------ |
| 타입      | TS strict(`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` 포함), Python 엄격 모드 |
| 억제 주석 | `any`, `type: ignore`, `eslint-disable`, `noqa`는 사유가 없으면 실패                       |
| 아키텍처  | 모듈 경계(다른 모듈 내부 import 금지)와 계층 방향(라우터 → 서비스 → 저장소)                |
| API       | 백엔드가 내보낸 `openapi.json`을 JSON:API 룰셋 사본으로 검사                               |
| 생성물    | "직접 수정 금지" 헤더, 최신 여부 검사, Claude Code 권한으로 Edit·Write 차단                |
| 다국어    | 프론트 카탈로그의 로케일 간 키 일치, 백엔드 메일 템플릿의 로케일 누락                      |
| 설정      | `.env.example`과 설정 검증 스키마의 일치                                                   |
| 지침 파일 | AGENTS.md·CLAUDE.md 짝, CLAUDE.md 내용, 루트 AGENTS.md 200줄 이하                          |
| 파일 크기 | 소스 400줄, 테스트 600줄 초과 시 실패(생성물 제외)                                         |
| 비밀      | 커밋 전 Betterleaks 스캔                                                                   |

## Claude Code hooks

모든 hook은 쉘을 거치지 않는 exec form이다. Windows(Git Bash 또는 PowerShell), macOS, Linux에서 똑같이 동작한다.

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/stop-check.mjs"]
          }
        ]
      }
    ]
  }
}
```

| 이벤트                              | 동작                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PostToolUse` (`Edit`, `Write`)     | 고친 파일만 포맷하고 빠른 린트를 돌려 남은 오류를 Claude에게 전달한다                                                                                                     |
| `Stop`                              | `stop_hook_active`면 통과. 이번 턴에 작업 트리가 바뀌었으면 빠른 `check`를 돌리고 실패하면 막는다                                                                         |
| `PreToolUse` (`Bash`, `PowerShell`) | 원격 DB 대상 명령, 강제 푸시, git hook 건너뛰기와 끄기, 적용된 마이그레이션 수정·삭제, 셸로 `.env` 읽기 같은 위험한 명령을 막는다. `bash -c` 같은 감싼 명령도 풀어서 본다 |
| `SessionStart`                      | 인프라 기동 여부, 적용 안 된 마이그레이션, 생성물 최신 여부를 요약해 넣는다                                                                                               |

- Claude Code는 진전 없이 연속 8번 막힌 Stop hook을 무시한다. 무한 반복은 `stop_hook_active`로 먼저 끊는다.
- `.env` 읽기 차단은 명령의 단어만 보는 최선의 검사다. 파일을 스스로 여는 프로그램(`cp`, `python -c "open('.env')"`)은 잡지 못한다.
- hook 스크립트도 입력 JSON 픽스처로 테스트한다. 출력 형식은 구현할 때 공식 레퍼런스(https://code.claude.com/docs/en/hooks)로 확인한다.

## 권한 (`.claude/settings.json`)

- 허용: 명령 어휘와 읽기 전용 git 명령.
- 차단: 비밀이 든 환경 파일 읽기, 생성물 경로의 Edit·Write, 위험한 명령.
- `.env.example`은 AI가 읽어야 하므로 `.env*` 같은 넓은 차단 패턴을 쓰지 않는다.

## 골든 모듈, 생성기, 레시피, skill

- 골든 모듈 `posts`는 모든 계층, 테스트, 권한, 실시간, 다국어의 정답 예시다.
- 생성기(`gen:module <name>` 등)는 골든 모듈을 복사해 이름을 바꾸고 등록 작업(라우터·모듈 등록, 권한 문자열, i18n 키, 마이그레이션 초안, 테스트)까지 처리한다.
- 골든 모듈은 생성기가 읽는 표시를 주석으로 단다(복사하지 않을 줄, 이름을 바꾸지 않을 줄, 새 모듈에서 고칠 곳). 생성기는 만든 뒤 고칠 곳을 목록으로 알린다.
- 절차의 원본은 `docs/recipes/*.md`다. Claude Code skill(`.claude/skills/<이름>/SKILL.md`)은 레시피를 불러오고 생성기를 호출하는 얇은 포장이다.
- 공식 제공 skill이 있으면 넣는다(FastAPI 공식 에이전트 skill, Next.js `next-dev-loop`, Playwright CLI skill).

## 외부 도구 연결

- 프론트엔드의 `.mcp.json`에 버전을 고정한 `next-devtools-mcp`를 넣는다. 백엔드는 기본으로 MCP를 넣지 않는다.
- 화면 확인은 Playwright의 에이전트용 CLI와 skill로 한다.
- 설치된 버전의 문서를 보게 한다. Next.js는 `node_modules/next/dist/docs`, 그 밖의 라이브러리는 템플릿의 `docs/stack.md`에 버전과 문서 링크를 적는다.

## 최종 안전망

- lefthook: pre-commit에서 스테이징된 파일을 포맷·린트하고 Betterleaks로 비밀을 스캔한다. pre-push에서 `check`를 돌린다.
- CI: `check`, `test:e2e`, Docker 이미지 빌드. 생성 프로젝트도 자기 CI에서 같은 검사를 돈다.

## 공유 자산

- 템플릿은 저장소의 다른 폴더를 참조하지 않는다. 공유 자산은 사본으로 들어간다.
- 원본과 사본 위치는 `scripts/shared-assets.json`에 적는다. `pnpm sync`가 파일·폴더를 복사하며 `mode: "overlay"`는 원본 파일만 대상의 같은 상대 경로에 덮는다. 다른 앱 파일은 보존한다.
- Next.js 공통 코드·테스트·하네스의 원본은 `shared/nextjs/`다. 대상은 `templates/nextjs`와 `templates/nextjs-admin`이다. 덮어 놓기는 git 인덱스의 원본만 복사하며 항목·대상의 `managedFiles`로 삭제된 사본까지 추적한다. 새 대상은 기존 대상의 기록을 물려받지 않는다. 기록은 생성 프로젝트에 들어가지 않는다.
- 공유 원본은 별도 프로젝트가 아니다. 루트 포맷·린트에서 제외하고 템플릿 사본의 check로 검사한다. 원본 자동 수정은 루트 `pnpm fix:shared [원본 파일...]` 뒤 `pnpm sync`로 한다. 저장소 사본 검사는 누락·내용 차이·삭제 사본 잔존을 거절한다.
- 사본을 직접 고치지 않는다. 원본을 고치고 `pnpm sync`를 돌린다.

지침 파일 검사는 `git ls-files --cached --others --exclude-standard`로 파일을 고른다. `.gitignore`에 있는 폴더(`.venv`, `node_modules` 등)는 보지 않는다.

## verify-templates가 검사하는 것

1. `template.json`이 있고 형식이 맞다.
2. 지침 파일 짝, CLAUDE.md 내용, 루트 AGENTS.md 길이.
3. 템플릿 종류에 맞는 명령 어휘가 모두 있다. 백엔드는 `e2e:serve`도 요구한다.
4. `.claude/settings.json`에 `PostToolUse`, `Stop`, `PreToolUse`, `SessionStart` hook이 exec form으로 있다.
5. `.env.example`, `.github/workflows/ci.yml`, `.gitattributes`, `docs/recipes/*.md`, 골든 모듈 폴더가 있다.
6. 공유 자산 사본이 원본과 같다.
7. web·admin의 공통 dependencies·devDependencies·overrides는 같은 버전이다. 차이가 있으면 두 버전과 잠금 파일 갱신 방법을 안내한다.
