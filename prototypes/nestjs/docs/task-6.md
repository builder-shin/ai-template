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

## 최초 CI와 발행 fixture 진단

원래 `dd798660`의 [PR CI 실행](https://github.com/builder-shin/ai-template/actions/runs/38194991406)은 13작업 중 12성공·stack 1실패로 끝났다. `flows.ts:84`의 별도 발행 worker 종료 코드가 기대 0 대신 1이었다. 원래 caller는 저장한 child tail을 assertion에 전달하지 않았으므로 그 worker의 stderr나 정확한 원인을 검토했다고 주장하지 않는다. 가입·메일·인증·로그인·API 발행의 진행은 순차 소스와 실패 위치에서 추론한 것이며 최종 processFlows 산출물은 없다.

같은 실행의 실제 이미지는 713,078,917바이트, UID10001, Node24.19.0, Prisma7.10.0이었다. Prisma 패키지 자체 42,052,481바이트는 전이 의존성을 제외한 값이다. 개발 app/Redis0 표식은 보존되고 app_e2e/Redis14 표식은 제거됐으며 소유한 최상위 프로세스 그룹 4개와 18000 포트가 닫혔다. 별도의 실제 통합 작업은 43/43과 10개 수명 주기의 명시적 종료·maxListeners10·새 listener 경고 0을 기록했다. 과거 Task3의 경고 기록은 유지한다. 마지막 suite의 프로세스 산출물을 전체 suite의 누적 PID 증거로 부르지 않는다.

현재 변경은 원인을 고쳤다는 주장이 아니라 다음 CI의 실패 진단이다. fixture는 bootstrap/register/update/close의 고정된 공개 단계 이름을 실패할 때만 출력하며 조용한 native1과 thrown error를 포함한다. 성공 출력에는 식별자를 넣지 않는다. caller는 실패할 때만 기존 8192자 child tail을 실제 child와 inherited command 양쪽의 알려진 비밀값을 가린 뒤 assertion에 넣는다. 실행에 준 같은 child 환경을 redaction에도 사용하므로 app_e2e/DB14로 바뀐 URL도 가린다. 실제 worker context·PostsService.update·commit·별도 프로세스의 Socket.IO 전달과 23바이트 업로드/다운로드, 종료 코드 0 등 기존 assertion은 유지한다.

로컬에서 새 SWC 산출물의 실제 AppModule을 인프라 대역으로 compile/register/close했고, 기존 fixture와 실제 compiled PostsService·Repository·UnitOfWork·PostEvents·Emitter를 제어된 transaction/Redis 포트로 실행했다. 둘 다 native0이어서 원인은 아직 미확정이다. 이 검사는 실제 DB commit이나 Redis/Socket.IO·worker 기동의 수용 증거가 아니다. 새로운 exact-head ALL13, 발행 worker의 실제 흐름·업로드/다운로드·OTel·app profile·41 적합성·web/admin smoke는 여전히 pending이며 Task7은 그 전체 CI 성공 뒤에만 시작한다.

## Redis 게시 완료 계약의 수정

위 진단 당시 기록 이후 `4c22a78e`의 [새 실제 CI](https://github.com/builder-shin/ai-template/actions/runs/38198199629)는 12성공·stack 1실패였다. child는 committed:true 다음 즉시 close 단계에서 ioredis Connection is closed로 종료1이었다. 이 결과는 이벤트 전달 성공으로 수용하지 않는다. 이번 이미지713,078,918바이트와 최초 dd 이미지713,078,917바이트를 구분하며 Prisma 패키지42,052,481바이트는 전이 의존성을 제외한다. 이번43/43 실제 통합 성공과 미도달한 게시/23바이트 업로드·OTel/app profile/41·smoke도 구분한다.

설치한 emitter5.1.0은 실제 publish Promise를 버리고 true를 반환했다. UnitOfWork가 훅을 await하더라도 worker 분기의 훅은 게시 완료 전에 반환하므로 lazy Redis 명령과 app.close가 경쟁할 수 있었다. ioredis6.0.0의 manual close는 대기 명령을 reject한다. production 수정 전 실제 런타임 클래스와 installed emitter를 제어된 포트로 검사해 조기 완료·rejection 누출을 native1로 재현했다. 이 소스/제어된 결과는 실제 로컬 Redis 실행이 아니다.

worker 분기는 installed emitter의 publish 포트에서 실제 Redis Promise를 관찰하고 await한다. 패킷 인코딩·namespace/key·룸 union은 emitter가 계속 맡으며 server 분기의 emit/ping·observer·payload·빈 룸과 기존 UnitOfWork의 commit 후 오류 containment는 유지한다. 새 DB 없는 테스트8개가 게시 완료까지 대기, 거부 전달과 commit 결과 보존·후속 훅, 겹친 게시, 기존 패킷/룸/서버 동작을 검사한다. timer/sleep, fixture 대기나 ping 추가, close 지연, 전역 오류 억제는 없다. 기존 즉시 app.close와 모든 process E2E assertion은 바이트 그대로다.

제어된 native RED/GREEN과 최종 로컬 gate 시간은 evidence 원장에 기록한다. Redis PUBLISH 완료가 실제 별도 프로세스 Socket.IO 전달을 대신 증명하지 않는다. 새 변경 HEAD의 WHOLE13·실제 발행/업로드·OTel/app profile/41·web/admin smoke가 필요하며 Task7과 최종 전체 제품 계획·새 사용자 승인은 계속 별도 게이트다.
