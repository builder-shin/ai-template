# FastAPI 대상 web E2E 스택

저장소 루트에서 `pnpm web-e2e fastapi`를 실행한다. 전용 스택을 준비하고 web 템플릿의 `pnpm test:e2e`에 `E2E_TARGET=fastapi`와 스택 주소를 전달한다. 목과 같은 Chromium E2E 20개를 필터 없이 실행한다. 템플릿은 외부 API 준비 뒤 web만 빌드·기동하며 Docker를 실행하지 않는다.

`--smoke`는 web E2E 대신 API 준비, 발행된 시드 글, Mailpit, 모의 OAuth, worker의 실제 인증 메일, SeaweedFS의 web Origin PUT preflight만 확인한다.

`--print`는 Docker를 실행하지 않고 전체 인자 배열을 보여 준다. 실행 ID는 자동으로 만들며 `--run-id <ID>`로 고정할 수 있다. 프로젝트는 항상 `ai-template-web-e2e-<ID>`, 앱 이미지 태그는 `ai-template-web-e2e-fastapi:<ID>`다. 동시에 두 번 실행하지 않는다. 포트가 이미 사용 중이면 시작하지 않는다.

같은 프로젝트의 컨테이너나 볼륨이 이미 있으면 기동·정리하지 않는다. 다른 `--run-id`를 쓰거나 해당 ID를 명시한 `--down`으로 먼저 정리한다.

개발 compose와 `.env`를 읽지 않는다. 명시적인 전용 파일 하나만 사용하고 셸의 `COMPOSE_*`는 제거한다. PostgreSQL·스토리지는 해당 프로젝트의 새 볼륨을 쓴다. API 18100, S3 28433, Mailpit 28125, OAuth 28180만 127.0.0.1에 공개한다. web 3100은 먼저 bind 검사하고 후속 E2E 명령이 사용한다.

시작을 시도한 프로젝트만 `down --volumes --remove-orphans`로 내린다. 실패하거나 SIGINT·SIGTERM으로 중단된 실행만 먼저 `ps`와 서비스 로그를 출력한다. 정리 중 받은 신호도 정리를 마친 뒤 종료 코드에 반영한다. 테스트 종료 코드와 정리 종료 코드를 따로 알린다. 테스트가 성공해도 정리가 실패하면 CLI는 1로 끝난다. 실패한 테스트의 종료 코드는 정리 실패로 덮지 않는다.

`--keep`은 성공한 스택만 디버깅용으로 남긴다. 끝내려면 출력한 `pnpm web-e2e fastapi --run-id <같은 ID> --down`을 실행한다. 이 경로도 전용 프로젝트와 파일을 명시하고 자동 환경 파일 읽기를 끈다. 실패하거나 신호를 받으면 `--keep`이어도 내린다.

스택을 성공적으로 내린 뒤 해당 실행의 이미지 태그만 강제 옵션 없이 제거한다. 이미지가 없으면 성공으로 처리하고 그 밖의 실패는 정리 종료 코드로 알린다. `--keep`은 이미지도 남기며 명시한 `--down`은 스택과 이미지를 함께 정리한다.

검증: `pnpm --filter @ai-template/scripts test`는 Docker 없이 인자·설정·포트·실패·정리를 검사한다. 실제 실행 전후에 `docker compose ls -a`와 `docker volume ls`를 비교한다. 개발 프로젝트 `fastapi`·`joon`과 `fastapi_*` 볼륨은 작업 대상이 아니다.
