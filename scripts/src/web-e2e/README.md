# FastAPI 대상 프론트 E2E 스택

저장소 루트에서 `pnpm web-e2e fastapi`를 실행한다. 전용 스택을 준비하고 web 템플릿의 `pnpm test:e2e`에 `E2E_TARGET=fastapi`와 스택 주소를 전달한다. 목과 같은 Chromium E2E 20개를 필터 없이 실행한다. 템플릿은 외부 API 준비 뒤 web만 빌드·기동하며 Docker를 실행하지 않는다.

`pnpm admin-e2e fastapi`도 같은 실행기의 앱 설정을 쓴다. admin 템플릿의 같은 Chromium E2E 18개를 필터 없이 실행한다. 앱별 계획만 다르고 포트 검사·기동·중단·정리 코드는 함께 쓴다.

| 값             | web                                     | admin                                         |
| -------------- | --------------------------------------- | --------------------------------------------- |
| 프로젝트       | ai-template-web-e2e-<ID>                | ai-template-admin-e2e-<ID>                    |
| 이미지         | ai-template-web-e2e-fastapi:<ID>        | ai-template-admin-e2e-fastapi:<ID>            |
| 실행 ID 변수   | WEB_E2E_RUN_ID                          | ADMIN_E2E_RUN_ID                              |
| compose        | scripts/compose/nextjs-e2e-fastapi.yaml | scripts/compose/nextjs-admin-e2e-fastapi.yaml |
| 프론트         | localhost:3100                          | localhost:3101                                |
| API·S3·Mailpit | 18100·28433·28125                       | 18101·28434·28126                             |
| OAuth          | 28180                                   | 서비스 없음                                   |

두 앱의 공개 포트가 겹치지 않아 스택을 함께 둘 수 있다. 같은 앱을 두 번 실행하면 포트 검사에서 거절한다. Docker가 필요한 실제 실행은 PR CI에서만 확인한다.

admin 스택의 FRONTEND_URL·REALTIME_ALLOWED_ORIGINS·STORAGE_ALLOWED_ORIGINS는 http://localhost:3101이다. RECENT_LOGIN_SECONDS는 10, 모든 레이트 리밋은 1000000이다. 자체 시드 계정(admin-e2e-admin@example.com)을 API로만 사용한다. admin E2E에는 E2E_SEED_ADMIN_EMAIL·E2E_SEED_ADMIN_PASSWORD를 반드시 넘긴다. 목은 기본 시드 계정을 쓴다. 계정마다 API 가입 후 대상 어댑터의 인증 메일 링크를 읽으며 FastAPI는 Mailpit을 쓴다.

admin은 소셜 로그인을 쓰지 않아 모의 OAuth 컨테이너와 readiness 조회를 생략한다. FastAPI 스키마에 필요한 OAuth 주소는 사용하지 않는 https://unused-oauth.example.com으로 명시한다. API readiness는 OAuth를 조회하지 않는다.

`--smoke`는 web E2E 대신 API 준비, 발행된 시드 글, Mailpit, 모의 OAuth, worker의 실제 인증 메일, SeaweedFS의 web Origin PUT preflight만 확인한다.

admin의 --smoke는 같은 항목에서 OAuth를 빼고 admin Origin의 메일 링크와 스토리지 PUT preflight를 확인한다. 프론트 빌드·브라우저 로그인은 실행하지 않는다. 18개 E2E가 관리자 권한·화면 동작을 확인한다.

`--print`는 Docker를 실행하지 않고 전체 인자 배열을 보여 준다. 실행 ID는 자동으로 만들며 `--run-id <ID>`로 고정할 수 있다. 프로젝트와 이미지 태그는 위 표의 앱별 접두사를 쓴다. 같은 앱을 동시에 두 번 실행하지 않는다. 포트가 이미 사용 중이면 시작하지 않는다.

같은 프로젝트의 컨테이너나 볼륨이 이미 있으면 기동·정리하지 않는다. 다른 `--run-id`를 쓰거나 해당 ID를 명시한 `--down`으로 먼저 정리한다.

개발 compose와 `.env`를 읽지 않는다. 명시적인 전용 파일 하나만 사용하고 셸의 `COMPOSE_*`는 제거한다. PostgreSQL·스토리지는 해당 프로젝트의 새 볼륨을 쓴다. 위 표의 앱별 API·S3·Mailpit 포트와 web의 OAuth 포트만 127.0.0.1에 공개한다. 프론트 포트는 먼저 bind 검사하고 후속 E2E 명령이 사용한다.

시작을 시도한 프로젝트만 `down --volumes --remove-orphans`로 내린다. 실패하거나 SIGINT·SIGTERM으로 중단된 실행만 먼저 `ps`와 서비스 로그를 출력한다. 정리 중 받은 신호도 정리를 마친 뒤 종료 코드에 반영한다. 테스트 종료 코드와 정리 종료 코드를 따로 알린다. 테스트가 성공해도 정리가 실패하면 CLI는 1로 끝난다. 실패한 테스트의 종료 코드는 정리 실패로 덮지 않는다.

`--keep`은 성공한 스택만 디버깅용으로 남긴다. 끝내려면 출력한 `pnpm web-e2e fastapi --run-id <같은 ID> --down`을 실행한다. 이 경로도 전용 프로젝트와 파일을 명시하고 자동 환경 파일 읽기를 끈다. 실패하거나 신호를 받으면 `--keep`이어도 내린다.

admin 정리 명령은 `pnpm admin-e2e fastapi --run-id <같은 ID> --down`이다. --print는 두 앱 모두 Docker·포트 조회·빌드 없이 계획만 출력한다.

스택을 성공적으로 내린 뒤 해당 실행의 이미지 태그만 강제 옵션 없이 제거한다. 이미지가 없으면 성공으로 처리하고 그 밖의 실패는 정리 종료 코드로 알린다. `--keep`은 이미지도 남기며 명시한 `--down`은 스택과 이미지를 함께 정리한다.

검증: `pnpm --filter @ai-template/scripts test`는 Docker 없이 인자·설정·포트·실패·정리를 검사한다. 실제 실행 전후에 `docker compose ls -a`와 `docker volume ls`를 비교한다. 개발 프로젝트 `fastapi`·`joon`과 `fastapi_*` 볼륨은 작업 대상이 아니다.
