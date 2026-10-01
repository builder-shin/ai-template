# FastAPI 대상 web E2E 스택

저장소 루트에서 `pnpm web-e2e fastapi`를 실행한다. 전용 스택을 준비하고 web 템플릿의 `pnpm test:e2e`에 `E2E_TARGET=fastapi`와 스택 주소를 전달한다. 목과 같은 Chromium E2E 20개를 필터 없이 실행한다. 템플릿은 외부 API 준비 뒤 web만 빌드·기동하며 Docker를 실행하지 않는다.

`--smoke`는 web E2E 대신 API 준비, 발행된 시드 글, Mailpit, 모의 OAuth, worker의 실제 인증 메일, SeaweedFS의 web Origin PUT preflight만 확인한다.

`--print`는 Docker를 실행하지 않고 전체 인자 배열을 보여 준다. 실행 ID는 자동으로 만들며 `--run-id <ID>`로 고정할 수 있다. 프로젝트는 항상 `ai-template-web-e2e-<ID>`, 앱 이미지 태그는 `ai-template-web-e2e-fastapi:<ID>`다. 동시에 두 번 실행하지 않는다. 포트가 이미 사용 중이면 시작하지 않는다.

개발 compose와 `.env`를 읽지 않는다. 명시적인 전용 파일 하나만 사용하고 셸의 `COMPOSE_*`는 제거한다. PostgreSQL·스토리지는 해당 프로젝트의 새 볼륨을 쓴다. API 18100, S3 28433, Mailpit 28125, OAuth 28180만 127.0.0.1에 공개한다. web 3100은 먼저 bind 검사하고 후속 E2E 명령이 사용한다.

실패와 SIGINT·SIGTERM을 포함해 시작을 시도한 프로젝트만 진단하고 `down --volumes --remove-orphans`로 내린다. 테스트 종료 코드와 정리 종료 코드를 따로 알린다. 테스트가 성공해도 정리가 실패하면 CLI는 1로 끝난다. 실패한 테스트의 종료 코드는 정리 실패로 덮지 않는다.

`--keep`은 성공한 스택만 디버깅용으로 남긴다. 끝내려면 출력한 `pnpm web-e2e fastapi --run-id <같은 ID> --down`을 실행한다. 이 경로도 전용 프로젝트와 파일을 명시하고 자동 환경 파일 읽기를 끈다. 실패하거나 신호를 받으면 `--keep`이어도 내린다.

검증: `pnpm --filter @ai-template/scripts test`는 Docker 없이 인자·설정·포트·실패·정리를 검사한다. 실제 실행 전후에 `docker compose ls -a`와 `docker volume ls`를 비교한다. 개발 프로젝트 `fastapi`·`joon`과 `fastapi_*` 볼륨은 작업 대상이 아니다.
