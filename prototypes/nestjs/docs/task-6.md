# Task 6: 이미지와 격리 실행기

이 문서는 draft 증거 프로토타입의 실행 계약을 기록한다. 최종 템플릿이나 최종 제품 계획 승인이 아니다. 실제 이미지·DB·Valkey·메일·스토리지·적합성·smoke 결과는 새 exact-head PR CI가 증명한다.

`pnpm e2e:serve [--web-url <Origin>] -- <명령> [인자...]`는 `INIT_CWD`를 명령의 작업 폴더로 쓴다. 없으면 현재 폴더를 쓴다. 실제 Node 24.19.0/pnpm 12.6.0의 무해한 로컬 probe에서 `--`가 argv에 남았고 `--dir`로 호출한 경우에도 INIT_CWD는 호출 폴더였다. 파서는 이 모양을 그대로 받으며 명령을 셸 없이 실행한다. Origin은 계정·경로·쿼리·조각이 없는 문자 그대로의 http(s) Origin이어야 한다.

실행기는 `tsx`로 도구만 실행하고 API·worker·scheduler는 빌드한 `dist/`에서 띄운다. 물리 임시 경로의 보수적인 tsx IPC 길이를 실행 전에 검사한다. 프로세스 도우미는 `shared/nextjs/scripts/process-tree.mjs`의 바이트 그대로인 사본이다. Darwin의 신호 0 EPERM은 원본의 제한된 polling으로 다룬다. 최종 템플릿의 공유 사본 등록 여부는 최종 계획에서 결정한다.

인프라를 직접 띄우지 않는다. 소유한 NestJS PostgreSQL과 DB·Valkey·Mailpit 준비가 없으면 setup 안내로 실패한다. `app_e2e` 관리 DB를 검사하고 migrate·TRUNCATE·seed를 실행하며 Redis DB 14만 비운다. 개발 DB `app`과 DB 0은 실행 대상이 아니다. 기존 버킷 CORS Origin과 설정 Origin, 선택한 web Origin의 합집합을 적용한다. API는 127.0.0.1:18000에 바인딩하고 `/health/ready`의 200을 최대 60초 기다린다. 실패하면 마지막 8192자 로그를 내고 1로 끝난다. 서버가 먼저 죽으면 명령 성공도 실패로 처리한다. SIGINT·SIGTERM과 정리 실패도 종료 코드에 반영하며 명령·세 서버의 소유 그룹을 정리한다.

서버 설정은 큰 전역/엄격 리밋, RECENT_LOGIN_SECONDS=10, FRONTEND_URL, REALTIME_ALLOWED_ORIGINS, STORAGE_ALLOWED_ORIGINS, OAUTH_REDIRECT_URIS=<Origin>/oauth/callback, API_URL을 덮어쓴다. 명령에 E2E_API_URL, E2E_WEB_URL, E2E_MAILPIT_URL, E2E_OAUTH_URL, E2E_RECENT_LOGIN_SECONDS, E2E_SEED_ADMIN_EMAIL, E2E_SEED_ADMIN_PASSWORD를 준다. 시드 비밀번호를 로그에 출력하지 않는다.

Dockerfile은 Node 24.19.0 bookworm-slim과 pnpm 12.6.0의 다단계 frozen 설치, Prisma generate, SWC 빌드, 운영 의존성, UID/GID 10001을 사용한다. 이미지에 HEALTHCHECK를 두지 않는다. Compose API가 Node fetch readiness를 검사한다. migrate·storage-init·api·worker·scheduler가 이미지 하나를 사용하며 migrate는 `pnpm exec prisma migrate deploy && node dist/seed.js`다. 이를 위해 Prisma CLI 7.10.0을 운영 의존성에 둔다. CI는 이미지 전체 크기와 Prisma 패키지 자체 바이트를 기록한다. 패키지 바이트에는 공유·전이 의존성이 빠지므로 CLI 없는 이미지 전체 크기와의 비교로 부르지 않는다. 크기에 따른 최종 제품 선택은 실측 결과를 포함한 최종 계획에서 정한다.

빌드한 storage-init 진입점을 위해 기존 storageSetup 함수를 core/storage/setup으로 옮겼다. 기존 도구는 같은 함수를 다시 공개하며 버킷 보존/CORS 동작은 같다. 기존 API 기본 바인딩은 유지하고 E2E가 명시한 HOST만 선택한다. 이 연결 변경과 소유 확인의 선택적 자식 환경은 이미지와 격리 실행기용이다. 적합성 NestJS 프로젝트는 명시한 nestjs이고 기존 FastAPI args는 유지한다. 이전 43 통합 사례·인증13·quota20·기존 bounded wait는 유지한다.

`pnpm test:e2e`는 같은 준비 경로를 통해 가입 → 별도 worker SMTP 인증 메일 → 인증 → 로그인, API 글 발행과 별도 실제 worker context의 post.published 전달, presigned PUT → 완료 → 실제 내려받기만 확인한다. CI 전후에 개발 DB와 DB 0 표식을 보존하고 app_e2e/DB14 표식만 초기화됐는지, 18000 포트와 소유 자식/그룹이 사라졌는지 검사한다. 로컬 fake-process 검사는 실제 인프라 수용 증거가 아니다.

적합성은 변경하지 않은 94개 선언 중 승인된 41개 이름을 정확히 고른다. CI JSON reporter의 실제 passed/skipped/failed/total과 사례 이름을 기록하고 각각 41/53/0/94인지 검사한다. 건너뛴 53개와 web20/admin18 전체 검증은 최종 SDD 범위다. web/admin 전용 스택은 NestJS가 든 프로젝트 접두사와 이미지 태그를 쓰고 FastAPI와 같은 공개 포트를 검사한다. `--smoke`는 프론트 E2E 본체를 실행하지 않는다.

OpenTelemetry는 기본 꺼져 있다. CI는 `OTEL_ENABLED=true node --import ./dist/core/telemetry/register.js dist/main.js`의 실제 HTTP·Express·pg·ioredis span 수와 헬스 요청 전후 span 차이를 메모리 exporter 파일에 기록한다. 누락은 이 Task를 막지 않지만 complete로 부르지 않는다. 설치한 HTTP 계측은 ignoreIncomingRequestHook이 참일 때 suppressTracing을 사용한다. ESM 계측의 loader 필요 여부와 대안은 실제 CI 결과와 설치한 소스로 판단한다. 공식 [ESM 안내](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/esm-support.md)는 탐색 정보이며 고정 버전의 실제 수용 증거가 아니다.

새 직접 계측 pin은 SDK Node/HTTP 0.223.0, sdk-trace-base 2.12.0, Express/ioredis 0.71.0, pg 0.75.0이다. 조회한 공개일은 모두 24시간보다 이전이고 minimumReleaseAge=1440을 유지한다. 최초 설치의 protobufjs build-policy 실패와 정책 placeholder 중복 오류를 보존했다. 설치한 protobufjs 7.6.6 postinstall은 버전 선언 경고만 내므로 allowBuilds에서 false로 명시했다. 프론트 override나 peer 억제를 추가하지 않았다. 기존 optional ESLint peer 제한은 그대로다.

로컬 최종 검사와 실제 명령 시간은 evidence 원장에 보충한다. 이미지 크기/UID/migrate, 실제 격리·SMTP·S3·41 적합성·smoke·OTel과 새 13개 CI 작업 전체 수용은 코디네이터의 exact-head 확인 전까지 pending이다.
