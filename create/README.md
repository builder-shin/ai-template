# 프로젝트 생성 CLI

저장소 루트에서 `pnpm new --help`로 단독·조합 생성 명령을 확인한다.

단독 템플릿은 fastapi, nextjs, nextjs-admin이다. `pnpm new <대상> --template nextjs-admin [--name <이름>] [--no-git]`은 관리 앱을 만든다. 두 프론트는 package.json의 name과 README 제목만 프로젝트 이름으로 바꾸며 다음 명령은 pnpm setup이다. 단독 admin은 이름 admin을 허용한다.

FastAPI가 있는 프로젝트는 이름 `fastapi`를 예약한다. 템플릿의 개발 compose 이름과 겹치므로 대상 폴더 이름과 `--name` 모두 거절하며, 다른 `--name`을 지정한다. 단독 nextjs·nextjs-admin은 허용한다. 다른 로컬 compose 프로젝트와도 이름이 겹치지 않도록 사용자가 고른다. 같은 이름은 볼륨을 공유한다.

조합은 앱의 workspace 패키지 이름인 `api`·`web`·`admin`도 예약한다. 대상 폴더 이름과 `--name` 모두 오류 2로 거절하며, 다른 `--name`을 지정한다. 단독 프로젝트는 세 이름을 허용한다.

FastAPI 템플릿은 compose 이름을 고정하지 않는다. CLI는 생성한 `compose.yaml` 맨 앞에 설명 주석과 `name: <이름>`을 삽입하고 앱 이미지 값만 바꾼다. 템플릿에 이미 최상위 `name`이 있으면 지우도록 안내하고 실패한다.

CLI 위치가 git 저장소 루트와 맞아야 한다. Windows에서는 경로의 대소문자나 8.3 짧은 이름이 달라도 실제 같은 위치로 인정한다. 다른 폴더 구조에서 실행하면 배치 오류로 거절한다. 대상은 원본 저장소의 어느 worktree 안에도 둘 수 없다.

대상 경로의 드라이브나 공유를 찾을 수 없으면 폴더를 만들기 전에 거절하고 접근 가능한 위치를 지정하도록 안내한다.

실패는 `pnpm new: <문제> — <고치는 방법>` 한 줄로 알린다. 문제에는 시스템 오류 코드와 경로, 일반 오류 이름과 원인, git stderr의 첫 줄, 또는 잘못 지정한 옵션의 원인을 포함한다. 잘못된 이름을 포함한 사용법 오류는 종료 코드 2, git·pnpm 단계가 SIGINT·SIGTERM으로 끝나면 130(주로 POSIX), 그 밖의 오류는 1이다. 기존 빈 폴더는 유지하고 생성한 항목만 넣는다. 실패하면 생성한 항목과 새 부모 폴더를 재시도하며 정리하고, 정리도 실패하면 원래 원인과 남은 경로를 함께 알린다.

생성 중 Ctrl+C로 중단하면 대상 옆의 임시 폴더 `aitpl-<이름>-XXXXXX`가 남을 수 있으므로 지운다. 새 대상은 완성한 임시 폴더를 한 번에 옮기지만, 기존 빈 대상에 항목별로 옮기는 도중 중단하면 대상도 일부 채워질 수 있으므로 생성된 항목을 비운다. 옮긴 뒤 git 단계에서 중단하면 새 대상과 기존 빈 대상 모두 첫 커밋 없이 또는 일부 지워진 채 남을 수 있으므로 대상을 지우고 다시 만든다(`--no-git` 제외). CLI는 동기 실행이고 tsx 아래에서 돌며 Windows의 pnpm 자식은 숨겨서 실행하므로 중단 시 정리를 보장하지 않는다.

git 사용자 정보가 없으면 저장소를 초기화하고 파일을 스테이징한 뒤 `user.name`·`user.email` 설정과 출처를 담은 첫 커밋 명령을 안내한다.

첫 커밋은 복사한 템플릿 파일을 이름 목록으로 강제 추가하고 원본 인덱스의 실행 권한을 보존한다. 사용자의 전역 excludes가 `.env.example`, `.claude/`, `.mcp.json`을 무시해도 해당 파일을 빠뜨리지 않는다. 조합에서 새로 만든 파일도 프로젝트의 ignore 규칙에 따라 추가하며 설치물과 캐시는 포함하지 않는다.

조합 자산과 루트 `.gitattributes`·`.editorconfig`는 HEAD의 추적 내용만 복사한다. 이 입력에 미커밋 변경이 있으면 먼저 커밋하도록 안내한다. 프론트 환경 예제의 API·실시간 키와 package.json의 엔진·도구 버전이 빠졌으면 설치 전에 고치도록 안내한다.

조합은 `--api fastapi`에 `--web`, `--admin` 가운데 하나 이상을 지정한다. 프론트 템플릿의 추적 계약은 루트 `contract/`에 한 번 복사하고 앱 안에는 두지 않는다. 두 프론트의 계약은 경로·바이트·실행 권한이 같아야 하며 다르면 생성 전에 거절한다. TypeSpec·OpenAPI·목은 프론트들이 함께 쓰는 계약 하나다. 각 프론트의 `gen.config.json`은 `{ "openapi": "../api/openapi.json", "contract": "../../contract" }`이며 workspace 패키지는 `apps/api`, 있는 프론트, `contract/*`다.

잠금 파일의 앱 importer(`.`)는 `apps/<앱>`으로 옮기고 `contract/<패키지>`는 루트 경로를 유지한다. 같은 계약 importer·패키지·snapshot 키는 해석이 같을 때만 합친다. 계약 importer 목록과 도구 설치 문서도 같아야 한다. 충돌은 키와 두 앱 이름, 잠금 파일을 맞추는 방법으로 안내한다. 루트·api를 풀고 모든 프론트 importer·패키지 resolution·snapshot의 해석 보존을 확인한 뒤 frozen 설치와 각 프론트 gen을 실행한다.

workspace의 minimumReleaseAge·allowBuilds·overrides는 두 프론트에서 같아야 한다. 차이가 있으면 두 값과 수정 방법을 안내하며 TypeScript override는 템플릿 버전으로 유지한다. 저장소 verify-templates도 이 설정을 비교한다. 계약 검사의 상대 참조를 위해 `tsconfig.base.json`·`docs/conventions/`는 루트와 각 프론트에 복사한다. 루트 Node 타입·Vitest·YAML 버전은 첫 프론트의 검증한 버전을 쓴다.

조합 생성기는 프론트 앱 목록으로 앱 경로·workspace·gen·하네스를 정한다. 루트 package·turbo 설정과 CI는 생성할 때 있는 앱만 남기며 setup·check·E2E·hook은 실행할 때 `apps/*/package.json`의 배치를 읽는다. 공유 계약 변경은 모든 프론트의 Stop hook에 전달한다. admin의 앱 이름은 admin이며 이미지도 조합 루트 문맥에서 빌드하고 포트 3001을 쓴다.

E2E는 프론트의 app.config.json에서 ports.e2e를 읽고 api e2e:serve에 --web-url로 넘긴다. pnpm run은 첫 --도 그대로 전달하므로 서버 옵션 앞에는 --를 더하지 않고, 자식 명령 앞에만 --를 둔다. 범용 frontend-e2e 실행기는 받은 API·메일·최근 로그인 값과 앱 Origin을 대상 환경으로 바꾸며 web만 OAuth URL을 요구한다. 관리 앱은 시드 관리자 두 변수를 요구한다.

MCP는 서버 이름으로 합친다. 같은 이름·같은 설정은 하나이며, 설정이 다르면 앱의 서버 설정을 맞추도록 안내하고 실패한다. 비밀 스캔은 생성 목록의 첫 프론트 도구로 한 번만 실행한다.

생성한 조합에서는 루트·각 프론트 사본의 공통 파일을 함께 맞춘다: `tsconfig.base.json`, `docs/conventions/`.
