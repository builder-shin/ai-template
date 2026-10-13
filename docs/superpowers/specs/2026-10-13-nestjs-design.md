# NestJS 백엔드 템플릿 설계

- 작성: 2026-10-13
- 조사 기준: MAIN `dc1c77c8f72c8638b0b0f5923ada303e4f84da0f`. 구현은 이 설계와 계획을 MAIN에 게시하고 새 승인을 받은 시점의 최신 MAIN HEAD에서 시작한다.
- 증거: 프로토타입 `7727356cbd7b9432042f604be7e53f06f1d9974b`(Draft PR, 병합하지 않는다)와 그 [최종 CI 38311942323](https://github.com/builder-shin/ai-template/actions/runs/38311942323)
- 상태: 제안. 새 사용자 승인 전에는 구현(SDD)을 시작하지 않는다.
- 구현 계획: [2026-10-13 NestJS 구현 계획](../plans/2026-10-13-nestjs.md)
- 함께 읽는 문서: [기반 설계](2026-09-26-ai-template-foundation-design.md), [FastAPI 설계](2026-09-26-fastapi-template-design.md), [FastAPI 하드닝](2026-09-29-fastapi-hardening-design.md), [생성 CLI 설계](2026-10-03-create-cli-design.md), [web 설계](2026-09-30-nextjs-web-design.md), [admin 설계](2026-10-08-nextjs-admin-design.md), [하네스 표준](../../harness/standard.md), [JSON:API 규약](../../conventions/jsonapi.md), [에러 코드](../../conventions/error-codes.md), [web 계약 동기화](../../conventions/web-contract.md)

이 문서는 FastAPI 템플릿과 같은 공개 플랫폼 계약 전체를 NestJS로 구현하는 독립 템플릿 `templates/nestjs`와, 그 템플릿을 저장소의 생성 CLI·적합성 실행기·프론트 E2E 실행기·CI에 붙이는 루트 통합을 정한다. 도메인 규칙(가시성, 전이, 세션, 메일 조건 등)은 FastAPI 설계와 하드닝 설계를 그대로 따른다. 이 문서는 NestJS에서 그 규칙을 지키는 방법과, 프로토타입이 실측으로 확인하거나 뒤집은 선택, 아직 열린 위험을 적는다.

## 1. 목적과 범위

### 1.1 성공 기준

| 항목   | 기준                                                                                                                                                            | 확인 위치                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 계약   | operation 39개, 컴포넌트 스키마 126개, `x-realtime-messages`(subscribe·unsubscribe)·`x-realtime-events`(7개)·`x-realtime-channels`(`posts`·`posts:all`)         | `check` 작업의 전체 `spec-compare`와 컴포넌트 구조 비교              |
| 적합성 | 흐름 파일 14개, 사례 94개 전부 통과                                                                                                                             | `conformance-nestjs`                                                 |
| 프론트 | web 브라우저 E2E 20개, admin 18개를 NestJS 백엔드에 붙여 통과                                                                                                   | `nextjs-e2e-nestjs`, `nextjs-admin-e2e-nestjs`                       |
| 생성   | NestJS 단독, NestJS+web, NestJS+admin, NestJS+web+admin 네 변형                                                                                                 | `create-standalone`, `create-combo-nestjs`                           |
| 하네스 | [하네스 표준](../../harness/standard.md) 전체                                                                                                                   | 루트 `check:templates`, 템플릿 `check`                               |
| CI     | 기존 10개 작업 이름과 동작 유지, 새 작업 5개(`nestjs`, `conformance-nestjs`, `nextjs-e2e-nestjs`, `nextjs-admin-e2e-nestjs`, `create-combo-nestjs`)를 더해 15개 | PR CI, MAIN CI                                                       |
| 무회귀 | FastAPI 단독·조합의 생성 결과 바이트·실행 권한, 포트, 이미지, setup의 uv 동작이 바뀌지 않는다                                                                   | `create-combo`, `create-standalone`, 루트 create 시험의 FastAPI 골든 |
| 관측   | OTel을 켜면 HTTP·Express(또는 명시 핸들러 span)·pg·ioredis span이 한 trace로 묶이고 헬스체크는 span을 만들지 않는다                                             | `nestjs` 작업의 계측 시험                                            |

### 1.2 범위 밖

- Prisma 8 이전. 질문 Q1(§16)에 따라 별도 사이클로 둔다.
- 원본 JSON 숫자 표기까지 FastAPI와 같게 만드는 작업. 질문 Q3에 따라 문서화된 차이로 둔다(§11).
- admin A3에서 승인된 별도 후속 항목: web BFF의 공유 IP 한도, web 시험 경고 17개 정리. 이 계획은 web 경고 17개·admin 0개 기준선을 바꾸지 않는다.
- Node 26 전환. 세 템플릿 공통 런타임 사이클로 따로 한다.

## 2. 증거와 그 한계

프로토타입은 일곱 Task로 인증·글·파일·잡·실시간·실행기·생성의 수직 슬라이스를 만들었다. 최종 CI 38311942323은 필수 14개 작업이 모두 성공했다. 결정의 근거는 공개 증거 문서 [evidence.md](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/docs/evidence.md)와 Task별 문서([task-2](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/docs/task-2.md)~[task-7](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/docs/task-7.md))에 있다.

프로토타입의 수용 범위는 부분적이다. 이 설계는 아래 값을 제품 수용으로 읽지 않는다.

| 관측          | 실제 값                                                                                                                                          | 제품 기준과의 차이                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| API 범위      | operation 19개, 스키마 83개                                                                                                                      | 39개·126개 전체가 필요하다                              |
| 적합성        | 선택 41개 통과·53개 건너뜀·실패 0, 94개 중(19,253.518ms)                                                                                         | 94개 전부 통과가 필요하다                               |
| 프론트        | web·admin 전용 스택 smoke(API·readiness·시드·Mailpit·worker 메일·스토리지 CORS, web은 OAuth도)                                                   | 브라우저 E2E 20·18개는 실행하지 않았다                  |
| 생성          | 네 변형의 frozen 설치·해석 보존·setup·API check·빌드·API e2e:serve readiness 200·이미지·Git clean                                                | 생성 프론트 전체 check와 브라우저 E2E는 실행하지 않았다 |
| 통합          | 실제 PostgreSQL·Valkey·SeaweedFS·Mailpit에서 43개·10 suite 통과, MaxListenersExceededWarning 0                                                   | 제품 전체 통합 시험의 일부다                            |
| OTel          | `node --import ./dist/core/telemetry/register.js dist/main.js`, 요청 200에서 HTTP 1·Express 0·pg 6·ioredis 0, 헬스 추가 span 0, `complete=false` | 완전한 계측이 아니다(§7.11)                             |
| 프로세스 정리 | Darwin에서 `process-tree`의 그룹 신호가 EPERM으로 두 번 174/175 실패, 허용된 한 번의 정상 검사 175/175                                           | 신뢰성이 고쳐졌다는 증거가 아니다(§9.4)                 |

실측 값은 최종 헤드 기준이다. 스택 이미지 713,108,263바이트·UID 10001·Node 24.19.0·Prisma 7.10.0, Prisma 패키지 자체 42,052,481바이트(전이 의존성 제외)다. 생성 단독 이미지는 713,108,278바이트, 루트 문맥 조합 API 이미지는 1,108,854,715(web)·1,108,854,741(admin)·1,108,861,113(both)바이트다. 이미지 태그를 지운 것은 이미지 층의 물리적 삭제를 증명하지 않는다.

## 3. 잠정 결정 27개의 최종 판정

브리프의 잠정 결정을 하나씩 확정(그대로)·수정(선택이나 조건이 바뀜)·미확정(실측이 없어 수용 시험으로 정함)으로 판정한다.

| 결정           | 판정              | 최종 선택                                                                                                                                                                                                                                                                                                                                                     | 근거                                                                                                                                                                                                       |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 위치         | 확정              | 승인 뒤 MAIN에서 `templates/nestjs`를 만든다. 첫 Task가 명령 어휘 전체를 선언하고, 아직 없는 명령은 "아직 없다(계획 Task N)"를 알리고 종료 코드 1로 끝난다(FastAPI M1과 같은 방식). 프로토타입 브랜치는 병합하지 않는다                                                                                                                                       | `verify-templates`는 `templates/` 아래 모든 폴더에 표준 전체를 요구한다                                                                                                                                    |
| 2 런타임       | 수정              | `engines.node` `">=24.15 <25"`, 이미지 `node:24.19.0-bookworm-slim`, pnpm 12.6.0, TypeScript 6.0.3, ESM(`nodenext`, 상대 import `.js`)                                                                                                                                                                                                                        | 하한은 Nest CLI가 쓰는 Angular devkit 22.2.0의 engines(`^24.15.0`)에서 왔다(R3). CI는 Node 24.19.0으로 실행했다                                                                                            |
| 3 Nest         | 확정              | `@nestjs/{common,core,platform-express,platform-socket.io,websockets,testing}` 12.1.2, `@nestjs/cli` 12.0.8, `@nestjs/bullmq` 12.0.0. `@nestjs/config`는 쓰지 않고 Zod 설정 스키마 하나를 쓴다                                                                                                                                                                | 프로토타입 전 Task와 CI                                                                                                                                                                                    |
| 4 빌드·시험    | 확정(근거 수정)   | 빌드 SWC(`nest build -b swc`), 타입 검사 `tsc --noEmit`, 시험 Vitest 5.0.1 + `unplugin-swc` 2.0.0. 앱 코드는 tsx로 실행하지 않는다. tsx는 DI가 없는 도구 스크립트에만 쓴다                                                                                                                                                                                    | tsc·SWC·Vitest-SWC는 DI metadata와 그래프가 같고 잘못된 type import를 거절했다. 탐색한 Oxc도 그래프를 검증했으나 채택하지 않는다(R2). tsx는 생성자 metadata를 내지 않아 그래프 검증이 false다              |
| 5 린트         | 수정              | ESLint 10.11.0 + typescript-eslint 8.71.0 + eslint-plugin-boundaries 7.2.0 + eslint-import-resolver-typescript 3.10.1, 프로젝트 규칙, oxlint 미채택. 선택적 peer로 설치되는 eslint-plugin-import 2.32.0의 선언 peer(ESLint ≤9) 불일치는 숨기지 않고 문서화한다(§13)                                                                                           | oxlint 타입 인식은 tsgolint가 없어 실패했다. peer 불일치는 프론트 잠금에도 같은 버전으로 있다(R3)                                                                                                          |
| 6 모듈         | 확정              | FastAPI와 같은 모듈 지도와 의존 DAG, 등록부 `src/modules/registry.ts`. 파일 역할은 §4.3                                                                                                                                                                                                                                                                       | 프로토타입 posts·files·auth 모듈                                                                                                                                                                           |
| 7 DTO          | 확정(방법 확정)   | 계약 이름으로 등록한 Zod 4.6.5 스키마가 단일 원본이다. 요청 검증은 자체 `JsonApiRequest`가 쿼리를 먼저, 경로·본문을 함께 `safeParse`한다. `StandardSchemaValidationPipe`는 쓰지 않는다                                                                                                                                                                        | 매개변수 파이프는 body·path·query를 동시에 시작해 본문 422가 먼저 이길 수 있었다. 집계 순서를 지키려면 직접 검증해야 한다(프로토타입 Task 2)                                                               |
| 8 OpenAPI      | 확정              | 자체 선언 레지스트리 + `z.toJSONSchema` + 측정한 변환 부산물만 지우는 정규화. `@nestjs/swagger` 12.0.2는 채택하지 않는다                                                                                                                                                                                                                                      | 83개 슬라이스와 FastAPI 산출물의 126개 공유 이름 비교에서 설명할 수 없는 차이 0. Swagger는 기본 변환기가 83개 컴포넌트를 인라인하고 discriminator를 잃었으며 사용자 변환기도 108개 차이와 자동 태그를 냈다 |
| 9 HTTP 순서    | 수정              | §5.1 순서. 라우팅은 strict routing, `routeResolutionStrategy: 'specificity'`, `routeConflictPolicy: { duplicate: 'error', shadow: 'warn' }`에 의도된 겹침 허용 목록 검사(§5.2)를 더한다                                                                                                                                                                       | 설치한 Nest 12.1.2의 `shadow: 'error'`는 선언 순서에 따라 결과가 달랐다(R1)                                                                                                                                |
| 10 Prisma      | 수정              | `prisma`·`@prisma/client`·`@prisma/adapter-pg` 7.10.0, `prisma-client` 생성기, `prisma.config.ts`, 로컬 고정 CLI만. 생성 클라이언트는 커밋하지 않고 `gen`이 만든다(§6.1)                                                                                                                                                                                      | 17파일·693,199바이트, Linux와 Darwin 매니페스트가 같았다. 결정성은 확인됐지만 크기·검토 잡음 대비 이득이 없다                                                                                              |
| 11 트랜잭션    | 수정              | `UnitOfWork`(interactive transaction + commit 뒤 훅). advisory lock은 transaction에 묶인 tagged `$executeRaw`, 행 잠금은 tagged `$queryRaw`의 `FOR UPDATE`. 연결 timeout 5000ms, pool 20, id `uuid(7)`. 계약 int64는 JSON number 정수(§5.3)                                                                                                                   | `pg_advisory_xact_lock`의 반환형 void(OID 2278)는 `$queryRaw`가 디코딩하지 못한다(프로토타입 Task 3). 실제 다중 연결 직렬화는 CI 통합 시험이 확인했다                                                      |
| 12 시험 계층   | 확정              | 단위(인프라 없음), 통합(실제 PostgreSQL·Valkey·SeaweedFS·Mailpit, DB `app_test`, 직렬, 시험마다 TRUNCATE·Valkey DB 15 비우기·Mailpit 비우기), 프로세스 E2E(`app_e2e`, Valkey DB 14), posts 권한 매트릭스                                                                                                                                                      | 43개 통합 시험과 프로세스 흐름                                                                                                                                                                             |
| 13 DB 가드     | 확정              | 대상 DB가 이 프로젝트의 Prisma 관리 DB인지 먼저 본다. `_prisma_migrations` 없이 비어 있지 않거나 다른 도구의 표(예: `alembic_version`)가 있으면 거절한다. `db:reset`은 로컬 호스트만                                                                                                                                                                          | FastAPI와 같은 포트 25432를 쓰므로 다른 템플릿의 DB를 지울 수 있다. CI 거절 시험                                                                                                                           |
| 14 보안        | 수정              | Argon2id는 `argon2` 0.45.1(`@node-rs/argon2`가 아님), 매개변수 m=65536·t=3·p=4·길이 32(pwdlib 기본값), 해시와 검증(가짜 검증 포함)에 늘 surrogatepass 바이트를 넘긴다. JWT는 `jose` 6.2.12 HS256 15분, `sub`·`sid`, 서명 검증 뒤 미래 `iat` 30초 허용 검사. refresh 32바이트·SHA-256 저장·30일 회전·재사용 감지. 이메일 해시 HMAC-SHA256. 운영 예시 비밀 거부 | `@node-rs/argon2`는 문자열 입력에서 짝 없는 서로게이트와 U+FFFD가 충돌하고 검증이 `Uint8Array`를 거절했다. jose 기본값은 미래 `iat`를 막지 않았다                                                          |
| 15 스토리지    | 확정(값 확정)     | AWS SDK v3 3.1149.0. presigned PUT은 SigV4 서명 헤더 `content-length;content-type;host`, 체크섬 계산·검증 `WHEN_REQUIRED`, 공개 엔드포인트 클라이언트로 서명하고 내부 엔드포인트로 HEAD·삭제·준비를 한다. path 방식                                                                                                                                           | 실제 SeaweedFS가 서명 헤더 4개·전송 헤더 5개 변조를 403 `SignatureDoesNotMatch`로 거절하고 객체를 만들지 않았다                                                                                            |
| 16 잡          | 확정              | BullMQ 6.3.12 + ioredis 6.0.0(후보 A, 5.81.5로 내려갈 일이 없었다), 잡 인자 `{ id }`만, 처음 포함 5회, 5초씩 늘고 최대 60초, 0~1000ms 지터, `removeOnComplete`, Job Scheduler, scheduler 단일                                                                                                                                                                 | 실측 지연 5391·10504·15151·20092ms(선택 5204·10478·15115·20050), 시도마다 새 토큰                                                                                                                          |
| 17 메일        | 확정              | `nodemailer` 10.1.0 SMTP, 모듈별 `templates/<ko                                                                                                                                                                                                                                                                                                               | en>/<메일>.{subject.txt,txt,html}`, 이스케이프 렌더러, 로케일 누락 검사                                                                                                                                    | 인증 메일 흐름                            |
| 18 실시간      | 확정(동작 확정)   | Nest 게이트웨이 + `IoAdapter` 하위 클래스(WebSocket 전용, Origin 정규화, Redis 어댑터). 처리기는 늘 `RealtimeAck`를 돌려준다. 티켓 `GETDEL`, worker·scheduler는 `@socket.io/redis-emitter`를 쓰되 Redis publish의 완료를 기다린다. 재검사는 `<prefix>:control` 채널                                                                                           | 고정 버전 ack probe: 페이로드 0개는 `undefined`, 배열은 그대로, null 반환은 ack 없음. emitter는 publish Promise를 버리고 `true`를 돌려준다(R11)                                                            |
| 19 관측성      | 수정·미확정       | JSON 로그는 Nest `ConsoleLogger`의 JSON 출력과 AsyncLocalStorage 요청 문맥(traceId)으로 만든다. pino·nestjs-pino는 쓰지 않는다. OTel은 기본 끔, `node --import` 등록, 헬스 span 없음. 전체 계측은 §7.11의 수용 시험으로 정한다                                                                                                                                | 프로토타입은 pino를 실측하지 않았다. OTel은 `complete=false`였다                                                                                                                                           |
| 20 배포        | 확정              | 이미지 하나(UID 10001, HEALTHCHECK 없음)로 api·worker·scheduler·migrate·storage-init를 띄운다. migrate는 `prisma migrate deploy && node dist/seed.js`, Prisma CLI는 운영 의존성으로 둔다. compose 기본 프로필은 인프라, `app`은 이미지, `observability`는 LGTM. 최상위 `name`은 두지 않는다                                                                   | 실측 이미지·UID, app 프로필 migrate·storage-init 종료 0, worker·scheduler 실행                                                                                                                             |
| 21 e2e:serve   | 확정(신뢰성 보강) | FastAPI 계약 그대로(§9.3). 프로세스 소유·준비·정리는 §9.4의 교차 플랫폼 규칙을 따른다                                                                                                                                                                                                                                                                         | 실제 CI 자식 환경·readiness 200·소유 그룹 종료·포트 18000 닫힘. Darwin EPERM 실패 두 번                                                                                                                    |
| 22 적합성      | 확정              | 대상 `nestjs`는 템플릿 compose의 `app` 프로필이고 개발 compose 프로젝트 `nestjs`와 개발 DB를 함께 쓴다(FastAPI와 같다). CI `conformance-nestjs`는 94개 전부를 돌린다                                                                                                                                                                                          | 선택 41개 실측. 선택 장치는 제품에 두지 않는다                                                                                                                                                             |
| 23 프론트 E2E  | 수정              | `pnpm web-e2e nestjs`·`pnpm admin-e2e nestjs`(전용 compose, 프로젝트 `ai-template-<app>-nestjs-e2e-<ID>`, 이미지 `ai-template-<app>-e2e-nestjs:<ID>`). 프론트 E2E 대상 `nestjs`는 공유 원본 `shared/nextjs/e2e/targets/index.ts`만 고쳐 sync한다(§10.3)                                                                                                       | 프로토타입 smoke와 실행기 guard 결함(R13)                                                                                                                                                                  |
| 24 조합        | 수정              | `--api fastapi                                                                                                                                                                                                                                                                                                                                                | nestjs`와 백엔드 서술자. 2단계 잠금 병합(§10.4), API 이미지 변환은 프론트 단계 선택 뒤, 루트 문맥 Dockerfile, 이름 `nestjs`예약, 생성 gen은 web → admin, 공유 계약은 조합 루트`contract/`                  | R14·R18·R19·R35·R39·R40과 최종 네 변형 CI |
| 25 하네스      | 확정(범위 보강)   | NestJS가 자기 스크립트를 소유한다. 공유 원본에서는 `.gitattributes`·`.editorconfig`·`api-style/lint.mjs`·`scripts/process-tree.mjs` 사본만 받는다. `shared/nextjs`는 E2E 대상과 `process-tree` 신뢰성 수정만 바꾼다                                                                                                                                           | R30이 단독 생성에 필요한 실제 하네스 입력의 누락을 드러냈다                                                                                                                                                |
| 26 CI          | 확정              | §10.5의 15개 작업                                                                                                                                                                                                                                                                                                                                             | 프로토타입 14개 작업의 대응 관계                                                                                                                                                                           |
| 27 차이 문서화 | 확정              | §11의 차이를 템플릿 `docs/architecture.md`의 "FastAPI와 다른 점"에 적고 적합성 범위 밖으로 둔다. 계약 실패를 일괄 무시하지 않는다                                                                                                                                                                                                                             | 목 서버의 같은 절, 프로토타입 차등 시험 20개                                                                                                                                                               |

## 4. 템플릿 구조

### 4.1 폴더 지도

```text
templates/nestjs/
├── AGENTS.md, CLAUDE.md(@AGENTS.md), README.md, template.json
├── package.json, pnpm-lock.yaml, pnpm-workspace.yaml
├── tsconfig.json, tsconfig.build.json, nest-cli.json, .swcrc
├── vitest.config.ts            # 단위·통합 project, e2e는 별도 설정
├── vitest.e2e.config.ts
├── eslint.config.js, .prettierrc.json, .prettierignore
├── .env.example, .gitignore, .dockerignore, .gitattributes(공유), .editorconfig(공유)
├── .betterleaks.toml, lefthook.yml
├── .claude/settings.json, .claude/hooks/*.mjs, .claude/skills/nestjs-backend/SKILL.md
├── compose.yaml, Dockerfile
├── prisma.config.ts, prisma/schema.prisma, prisma/migrations/**
├── openapi.json                # 생성물, 커밋한다
├── api-style/lint.mjs          # 공유 사본
├── docs/architecture.md, docs/stack.md
├── docs/recipes/{module,endpoint,migration,job,permission,mail-template,realtime-event}.md
├── .github/workflows/ci.yml    # 생성한 단독 프로젝트의 CI
├── scripts/                    # 도구(tsx로 실행): setup, dev, check, gen, db, e2e, gen-module, tools
│   ├── process-tree.mjs        # 공유 사본
│   └── lint/                   # 프로젝트 ESLint 규칙과 음성·양성 fixture
├── src/
│   ├── main.ts, worker.ts, scheduler.ts, seed.ts, storage-init.ts, app.module.ts
│   ├── core/{config,logging,http,jsonapi,db,redis,security,ratelimit,cache,jobs,mail,storage,audit,realtime,telemetry}
│   ├── modules/{health,auth,users,roles,audit-logs,files,realtime,posts}/ + registry.ts
│   └── generated/prisma/       # 커밋하지 않는다. gen이 만든다
└── tests/{integration,e2e}/    # 인프라가 필요한 시험
```

`template.json`은 `{"name":"nestjs","kind":"backend","runner":"pnpm","goldenModule":"src/modules/posts"}`다.

### 4.2 프로세스와 진입점

| 프로세스     | 진입점                        | 명령(이미지)                                           | 비고                                                                                               |
| ------------ | ----------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| api          | `src/main.ts`의 `bootstrap()` | `node dist/main.js`                                    | 포트 `PORT`(기본 8000). OTel을 켜면 `node --import ./dist/core/telemetry/register.js dist/main.js` |
| worker       | `src/worker.ts`               | `node dist/worker.js`                                  | `createApplicationContext`, BullMQ worker, 실시간 emitter                                          |
| scheduler    | `src/scheduler.ts`            | `node dist/scheduler.js`                               | 반드시 하나만 띄운다. Job Scheduler 등록과 주기 작업                                               |
| migrate      | —                             | `pnpm exec prisma migrate deploy && node dist/seed.js` | compose `app` 프로필의 1회 작업                                                                    |
| storage-init | `src/storage-init.ts`         | `node dist/storage-init.js`                            | 버킷 생성, CORS 교체                                                                               |

`createApp(overrides?, infrastructure = false)`는 인프라 없이 DI 그래프만 만든다(단위 시험, OpenAPI 생성, DI 검사). `overrides`는 설정·provider 교체와 시험 전용 모듈을 받는다. `bootstrap()`만 인프라 연결을 켠다.

### 4.3 모듈 경계

- 의존 DAG: `roles ← users ← auth`, `files` 독립, `realtime → auth`, `posts → users·files`, `audit-logs → users`, `health`는 core만 쓴다. `core`는 `modules`를 모른다.
- 모듈 파일 역할: `index.ts`(공개 인터페이스), `<이름>.module.ts`, `controller.ts`, `operations.ts`(operation 선언), `schemas.ts`(Zod 스키마), `service.ts`, `repository.ts`(Prisma 접근의 유일한 위치), `policies.ts`(권한·가시성 판정), `permissions.ts`(코드 권한), `events.ts`(실시간 이벤트), `jobs.ts`(잡 이름과 처리기), `templates/`(메일), `tests/`(단위 시험).
- 다른 모듈은 `index.ts`로만 가져온다. 생성 Prisma 클라이언트는 `repository.ts`와 `core/db`만 가져온다. ESLint boundaries와 프로젝트 규칙이 강제한다(§8.3).
- 등록부 `registerDomain(app)`이 include 로더, 읽기 규칙(`addReadRule`), 참조 검사(`addReferenceCheck`), 이벤트 선언, 잡 처리기, 주기 작업을 한곳에서 등록한다.

### 4.4 고정 버전

모든 직접 의존성은 정확한 버전으로 고정하고 `pnpm-workspace.yaml`에 `minimumReleaseAge: 1440`, `overrides: { typescript: 6.0.3 }`을 둔다. 프론트와 겹치는 직접 의존성 11개(jose 6.2.12, zod 4.6.5, @types/node 24.13.6, eslint 10.11.0, eslint-plugin-boundaries 7.2.0, prettier 3.9.9, socket.io-client 4.8.4, tsx 4.23.15, typescript 6.0.3, typescript-eslint 8.71.0, vitest 5.0.1)는 프론트와 같은 버전이어야 한다(§10.1의 루트 가드).

| 영역          | 고정 버전                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nest          | 12.1.2(6개), cli 12.0.8, bullmq 연동 12.0.0, reflect-metadata 0.2.2, rxjs 7.8.2, express 5.2.1, socket.io 4.8.3                                                                                                                                                                                                                                             |
| 언어·도구     | TypeScript 6.0.3, @swc/core 1.16.12, @swc/cli 0.8.1, unplugin-swc 2.0.0, vite 8.3.1, Vitest 5.0.1, tsx 4.23.15, supertest 7.3.1, socket.io-client 4.8.4                                                                                                                                                                                                     |
| 린트·포맷     | ESLint 10.11.0, @eslint/js 10.0.1, typescript-eslint 8.71.0, eslint-plugin-boundaries 7.2.0, eslint-import-resolver-typescript 3.10.1, Prettier 3.9.9                                                                                                                                                                                                       |
| 영속성        | prisma·@prisma/client·@prisma/adapter-pg 7.10.0, pg 8.23.1                                                                                                                                                                                                                                                                                                  |
| 보안          | argon2 0.45.1, jose 6.2.12                                                                                                                                                                                                                                                                                                                                  |
| 잡·실시간     | bullmq 6.3.12, ioredis 6.0.0, @socket.io/redis-adapter 8.3.0, @socket.io/redis-emitter 5.1.0                                                                                                                                                                                                                                                                |
| 스토리지·메일 | @aws-sdk/client-s3·s3-request-presigner 3.1149.0, nodemailer 10.1.0                                                                                                                                                                                                                                                                                         |
| 관측          | @opentelemetry/sdk-node·instrumentation-http 0.223.0, instrumentation-pg 0.75.0, sdk-trace-base 2.12.0, @opentelemetry/api 1.9.1. `api`(명시 span)는 프로토타입 잠금에 이미 같은 버전으로 있던 전이 의존성을 직접 의존성으로 올린 것이다. 실측 0개였던 instrumentation-express·instrumentation-ioredis 0.71.0은 명시 span으로 바꾸고 의존성에서 뺀다(§7.11) |
| 타입          | @types/node 24.13.6, @types/express 5.0.6, @types/supertest 7.2.1, @types/pg 8.23.1                                                                                                                                                                                                                                                                         |

`allowBuilds`는 `@swc/core`·`esbuild`·`unrs-resolver`·`@prisma/engines`·`prisma`·`argon2`를 true, `msgpackr-extract`·`protobufjs`·`lefthook`을 false로 명시한다. protobufjs 7.6.6 postinstall은 버전 선언 경고만 내므로 끈다.

## 5. HTTP와 JSON:API

### 5.1 파이프라인 순서

`createApp`은 Express 앱에 strict routing을 켠 뒤 `ExpressAdapter`를 만들고 `bodyParser: false`로 Nest 앱을 만든다. 요청은 다음 순서로 지난다.

1. traceId 미들웨어: 계측이 켜졌으면 활성 span의 trace id, 아니면 16바이트 난수의 32자리 16진수를 요청 문맥(AsyncLocalStorage)과 `res.locals.traceId`에 둔다.
2. 전역 레이트 리밋(`/api/` 아래, 우선순위 1): 초과하면 429.
3. 협상: 본문이 있는데 Content-Type이 JSON:API가 아니면 415, Accept가 JSON:API를 허용하지 않으면 406.
4. 본문 읽기: 압축 해제 없이 1,048,576바이트까지 읽고 넘으면 413(남은 입력은 비운다). JSON 문법·문서 구조가 틀리면 400.
5. HEAD는 경로와 관계없이 404(프로토타입은 `/api/` 아래만 막았다. 헬스체크까지 넓혀 FastAPI와 같게 한다), 등록되지 않은 경로는 404 에러 문서. 지원하지 않는 메서드도 `Allow` 없이 404다.
6. `OperationGuard`: 선언의 인증·권한에 따라 401(`WWW-Authenticate: Bearer`)·403.
7. `JsonApiRequest`: 쿼리 400을 먼저 내고, 경로와 본문은 함께 검증한다. 경로 404와 필드 422가 섞이면 400.
8. 핸들러: 엄격한 레이트 리밋(우선순위 8)은 본문 검증 뒤에 센다. 도메인 에러를 던진다.
9. 전역 예외 필터: 에러 문서(`status`·`code`·`title`·`meta.traceId`), 정확한 `Content-Type: application/vnd.api+json`.

실측한 우선순위는 415>413, 406>413, 413·JSON 400 > 401, 401·403 > 쿼리 400, 쿼리 400 > 본문 422, 경로 404 + 필드 422 → 둘 다 담은 400이다.

### 5.2 라우팅 정책

- strict routing은 `ExpressAdapter`를 만들기 전에 켠다. 끝 슬래시 경로는 404다.
- `routeResolutionStrategy: 'specificity'`와 `routeConflictPolicy: { duplicate: 'error', shadow: 'warn' }`를 쓴다. 완전히 같은 경로·메서드는 부팅 오류다.
- 의도된 겹침(예: `DELETE /api/v1/sessions/current`와 `DELETE /api/v1/sessions/{id}`)은 operation 레지스트리의 허용 목록에 선언한다. 단위 시험 `route overlap audit`가 모든 등록 경로 쌍을 계산해 허용 목록 밖의 shadow 쌍이 하나라도 있으면 실패한다. Nest의 `shadow: 'error'`는 선언 순서에 따라 결과가 달라 쓰지 않는다. 허용한 겹침은 두 선언 순서 모두에서 실제 HTTP로 구체 경로가 이기는지 시험한다.
- Nest 의존성은 고치지 않는다.

### 5.3 operation 선언과 Zod 스키마

- `defineOperation()`은 operationId, 메서드, 경로, 태그, 인증(`required`·`optional`·`none`), 권한, 쿼리·경로·본문 스키마, 응답 상태별 스키마, 에러 코드, 실시간 선언을 담는다. POST는 생성 에러(403 클라이언트 id, 409 타입 불일치)를, PATCH는 409를 자동으로 더한다. 선언 하나가 라우트 등록·검증·문서를 함께 만든다.
- 스키마 레지스트리는 계약 컴포넌트 이름으로 등록하고 `#/components/schemas/<이름>`으로 참조한다.
- 문자열 길이는 코드 포인트 수다(`codePointString(min, max)`). UTF-16 단위가 아니다. posts 본문 100,000 코드 포인트(200,000 UTF-16 단위)는 통과하고 100,001은 422다.
- int64는 JSON number 정수다. 유한한 `Number.isInteger` 값과 계약의 명시 경계(예: `FileCreateAttributes.size` 최소 1)만 검사하고 `format: int64`를 낸다. `MAX_SAFE_INTEGER` 상한을 임의로 더하지 않는다. `z.int64()`(BigInt)는 JSON Schema 변환에서 예외를 내므로 쓰지 않는다. `JSON.parse`는 2^53을 넘는 정수 표기의 정밀도를 잃는다(`9007199254740993`이 `9007199254740992`가 된다). BigInt 직렬화는 하지 않고 이 한계를 문서화한다.
- nullable은 `type: [T, "null"]`, 판별 유니온은 선언에서 discriminator를 낸다(Zod가 내지 않는다). `propertyNames`·`required`·enum·pattern·명시 경계를 지킨다. 이메일·UUID·날짜시간은 Zod 내장 검사가 pattern을 더하므로 자체 format 선언을 쓴다.
- 에러 코드는 계약의 `ErrorCode` 39개, 권한은 `PermissionCode` 8개를 Zod enum으로 선언하고 컴포넌트 비교로 계약과 묶는다.

### 5.4 JsonApiRequest와 쿼리

- 쿼리는 원본 URL에서 직접 파싱한다. 같은 키가 두 번 오면 400, 모르는 파라미터·필터는 `jsonapi.invalid_query`, 허용하지 않은 include·sort는 각각 `jsonapi.unsupported_include`·`jsonapi.unsupported_sort`다.
- 검증 이슈는 Zod의 `code`와 매개변수(`minimum`·`maximum` 등)로 에러 코드와 `meta.params`를 정한다. 영어 메시지를 파싱하지 않는다.
- 본문 pointer는 판별 유니온에서도 본문의 실제 위치를 가리킨다(예: grant 종류와 같은 이름의 필드가 있어도).
- `fields[type]`, `include`(점 경로), `sort`(`-` 내림차순), `page[number]`·`page[size]`, `filter[...]`를 선언에서 허용 목록으로 받는다. 컬렉션은 페이지 메타와 요청 경로 기준의 상대 페이지 링크를 담는다.

### 5.5 응답 쓰기

`DocumentInterceptor`는 문서를 직접 직렬화해 Buffer로 쓰고 `Content-Type: application/vnd.api+json`을 그대로 둔다(Express가 charset을 붙이지 않게). JSON 문자열의 비 ASCII 이스케이프는 소문자 `\uXXXX`다. include의 users는 늘 공개 형태다.

### 5.6 OpenAPI 생성과 계약 비교

- `pnpm gen`이 앱을 띄우지 않고 레지스트리에서 OpenAPI 3.1.0 `openapi.json`을 만들고 고정 Prettier로 포맷한다. `pnpm gen --check`는 다시 만든 결과가 커밋된 파일과 다르면 1로 끝난다.
- 정규화는 설치한 Zod 4.6.5 실측 행렬로 드러난 부산물만 지운다(예: 레지스트리 내보내기의 `$id` 정리, int32 암묵 경계 미채택). 계약 제약은 지우지 않는다.
- 템플릿은 저장소 계약을 읽지 않는다. 계약과의 비교는 루트가 한다: `check` CI 작업이 `pnpm spec-compare contract/openapi.yaml templates/nestjs/openapi.json`(이름·경로·상태 집합·실시간 선언·oasdiff)과 새 컴포넌트 구조 비교(`--schemas`, 설명할 수 없는 차이 0)를 돌린다. 구현 도중에는 `--subset`을 쓰고, 계약 전체가 구현된 Task부터 전체 비교로 바꾼다.
- 템플릿 `check`는 `api-style/lint.mjs`로 자기 `openapi.json`에 JSON:API 룰셋을 돌린다.

## 6. 영속성과 트랜잭션

### 6.1 Prisma

- `prisma-client` 생성기(ESM, `.js` import)로 `src/generated/prisma/`에 클라이언트를 만든다. `prisma.config.ts`는 `DATABASE_URL`을 받고, 스크립트는 `loadSettings()`로 읽은 값을 자식 환경으로 넘긴다. dotenv는 쓰지 않는다.
- 생성 클라이언트는 커밋하지 않는다. 최종 실측은 Linux 17파일·693,199바이트이고 Darwin 매니페스트와 같았다(결정적). 결정성 덕분에 CI가 다시 만든 결과를 믿을 수 있으므로, 693KB 생성물을 커밋해 얻는 재현성 이득이 없고 스키마를 바꿀 때마다 큰 검토 잡음과 크기 예외가 생긴다. 대신 다음을 강제한다.
  - `setup`과 `check`의 `gen` 단계가 lint·typecheck보다 먼저 `prisma generate`를 한다. 깨끗한 설치에서 lint가 생성 클라이언트를 찾지 못해 340개 에러로 실패했던 순서 결함(R6)을 막는다.
  - `src/generated/**`는 `.gitignore`에 있고, 하네스 검사가 `git ls-files src/generated`가 비어 있음을 확인한다. PreToolUse hook은 이 폴더의 편집을 막는다.
  - 생성 프로젝트에서도 생성 클라이언트는 추적하지 않는다. 단독 생성은 의존성을 설치하기 전에 첫 커밋을 하므로 클라이언트가 없고 첫 `pnpm setup`이 만든다. 조합 생성은 첫 커밋 전에 frozen 설치와 프론트 gen(web → admin)을 하지만 API의 `prisma generate`는 부르지 않는다. 조합의 클라이언트도 `.gitignore`로 첫 커밋에서 빠지며 조합 `pnpm setup`의 api 단계가 만든다.
- 로컬 고정 CLI만 쓴다. `npx prisma`·`pnpm dlx prisma`는 PreToolUse hook이 막는다. Prisma 8 RC가 npm `latest`이므로 고정하지 않은 실행은 8 CLI를 받는다(§16 Q1).
- 마이그레이션은 `prisma/migrations/`에 커밋한다. `db:revision <이름>`은 `prisma migrate dev --create-only --name <이름>`(shadow DB 사용)이고, 커밋된 마이그레이션 SQL의 편집은 PreToolUse hook이 막는다. CI는 `prisma migrate diff --from-config-datasource --to-schema --exit-code`로 스키마와 마이그레이션의 drift를 본다(0 같음, 2 다름).

### 6.2 연결과 표현

- `PrismaService`는 `@prisma/adapter-pg`(`pg` pool `max: 20`, `connectionTimeoutMillis: 5000`)로 연결한다.
- id는 `@default(uuid(7))`이다.
- 파일 크기 같은 64비트 열은 Prisma `BigInt`이고 JS `bigint`로 읽는다. 응답으로 낼 때 `Number.isSafeInteger`를 확인하는 내부 변환을 거친다. 값은 설정 한도(`FILE_MAX_SIZE`, `FILE_USER_QUOTA`)를 넘지 않으므로 이 확인은 데이터 손상을 잡는 불변식이다.

### 6.3 UnitOfWork와 commit 뒤 훅

- `UnitOfWork.run(fn, options)`는 interactive transaction 안에서 `fn(tx, afterCommit)`을 부르고, commit한 뒤에 등록 순서대로 훅을 기다린다. rollback하면 훅을 버린다.
- 훅이 실패하면 `After-commit hook failed.`를 로그로 남기고 다음 훅을 계속한다. commit한 결과는 그대로 돌려준다.
- 실시간 이벤트, 잡 enqueue, 캐시 세대 올리기, 스토리지 객체 삭제는 모두 commit 뒤 훅이다.
- refresh 재사용처럼 거절 응답과 함께 상태 변경(세션 폐기)을 남겨야 하는 경우는 트랜잭션 안에서 에러를 던지지 않는다. 결과 값으로 에러를 돌려주고 commit한 뒤 바깥에서 던진다.

### 6.4 잠금과 경쟁

| 경쟁                  | 방법                                                                                                                                                                 | 실측·시험                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| refresh 회전·재사용   | 세션 행 `SELECT … FOR UPDATE`(tagged `$queryRaw`)                                                                                                                    | 같은 토큰 10개 동시: 201 하나, 401 `auth.refresh_token_reused` 하나(그 세션을 폐기하고 commit), 나머지 8개는 폐기된 세션을 보고 401 `auth.token_invalid`. 이긴 쪽의 새 access·refresh도 뒤에 401이다. 500은 없다 |
| 파일 한도             | `files:quota:<사용자 id>` advisory lock(transaction에 묶인 tagged `$executeRaw`의 `pg_advisory_xact_lock(hashtextextended(key, 0))`) 아래 pending+ready 크기 합 계산 | 한도의 절반 크기 20개 동시 생성: 201 10개, 422 `file.quota_exceeded` 10개                                                                                                                                        |
| 마지막 활성 admin     | `role:admin` advisory lock 아래 남은 활성 admin 수 확인                                                                                                              | 동시 회수·비활성화·탈퇴 시험(제품 Task)                                                                                                                                                                          |
| 인증·재설정 토큰 소비 | `DELETE … RETURNING` 한 번으로 1회 사용                                                                                                                              | 같은 토큰 두 번 사용 시험                                                                                                                                                                                        |
| 이메일 중복 가입      | 고유 제약과 Prisma 7의 고유 위반 오류를 `validation.already_taken`으로 바꾼다                                                                                        | 동시 가입 시험                                                                                                                                                                                                   |

`$queryRawUnsafe`·`$executeRawUnsafe`는 ESLint 규칙이 금지한다. 세션 단위 advisory lock과 try-lock은 쓰지 않는다.

### 6.5 조회 쿼리 수와 격리

- posts 목록은 `RepeatableRead` 트랜잭션 하나에서 개수·행·include를 읽는다. 다른 연결의 commit이 끼어도 한 응답 안의 값이 일관된다.
- include는 관계 join(`relationLoadStrategy`)이 아니라 중복을 지운 id 묶음 조회다. 1페이지와 20페이지 모두 5개 문장(SELECT 4개 + COMMIT)으로 같았다. 쿼리 수 시험이 이 상수를 고정한다.
- 한국어 제목 정렬은 DB collation을 따른다.

### 6.6 DB 가드

- `db:migrate`·`db:reset`·통합 시험·E2E 준비는 대상 DB를 먼저 검사한다. 비어 있지 않은데 `_prisma_migrations`가 없거나, 다른 도구의 표(예: `alembic_version`)가 있으면 이름과 함께 거절한다.
- `db:reset`은 호스트가 `127.0.0.1`·`localhost`·`::1`일 때만 한다.
- `setup`의 DB 생성(`app`, `app_test`, `app_e2e`)은 compose 프로젝트의 postgres 컨테이너가 이 프로젝트 소유일 때만 한다(FastAPI와 같다).

### 6.7 시험 격리

| 용도                     | DB         | Valkey DB | Redis 키 접두사 |
| ------------------------ | ---------- | --------- | --------------- |
| 개발                     | `app`      | 0         | `aitpl:0`       |
| 통합 시험                | `app_test` | 15        | `aitpl:15`      |
| 프로세스 E2E·`e2e:serve` | `app_e2e`  | 14        | `aitpl:14`      |

`redisNamespace(url)`은 DB 번호 0·14·15만 받고 다른 번호는 거절한다. 접두사는 일반 키, BullMQ prefix, 제어 채널, Socket.IO 어댑터·emitter key에 모두 들어간다. 통합 시험은 직렬로 돌고 시험마다 `TRUNCATE … RESTART IDENTITY CASCADE`, Valkey DB 15 `FLUSHDB`, Mailpit 메시지 삭제를 한다. 인프라에 닿지 못하면 "setup을 실행하라"는 한 줄과 함께 실패한다. CI는 개발 `app`·Redis 0 표식이 보존되고 `app_e2e`·Redis 14 표식만 지워짐을 확인했다.

## 7. 도메인

도메인 규칙은 [FastAPI 설계](2026-09-26-fastapi-template-design.md) §6과 [하드닝 설계](2026-09-29-fastapi-hardening-design.md)를 따른다. 아래는 NestJS의 구현 방법과 실측으로 정한 값이다.

### 7.1 가입·인증·세션

- 가입(`Registrations_create`)은 비밀번호 바이트를 해시해 사용자를 만들고 인증 메일 잡을 commit 뒤에 넣는다. 인증 메일 재발송(`EmailVerificationRequests_create`)은 계정이 있든 없든 202다. 인증(`EmailVerifications_create`)은 토큰(24시간, 1회용)을 소비한다. 메일을 다시 받으면 새 토큰만 유효하다.
- 로그인(`Sessions_create`)은 비밀번호 또는 소셜 로그인 1회용 코드(`oauthCode`+`codeVerifier`)를 받는다. 실패하면 401 `auth.invalid_credentials`, 미인증 이메일은 403 `auth.email_not_verified`, 비활성 계정은 403 `auth.account_deactivated`다. 성공·실패 모두 감사 로그를 같은 트랜잭션에 남긴다.
- access token 15분, refresh 30일 회전. refresh는 해시만 저장한다. 재사용을 감지하면 세션 계열을 폐기하고 `session.revoked`를 보낸다.
- 세션 목록(`Sessions_list`)은 만료·폐기된 세션을 빼고 `createdAt`·`lastUsedAt` 정렬을 받는다. 현재 세션 로그아웃(`Sessions_deleteCurrent`), 다른 세션 폐기(`Sessions_delete`), 다른 기기 전체 폐기(`SessionRevocations_create`, `revokedCount`, 감사 `session.all_revoked`)는 즉시 효과가 있고 연결된 실시간 소켓을 끊는다.
- 탈퇴(`Me_delete`)는 로그인한 지 `RECENT_LOGIN_SECONDS`(기본 600초) 안의 세션만 한다. refresh는 로그인 시각을 바꾸지 않는다.

### 7.2 비밀번호와 토큰

- `passwordBytes(password)`는 Python `surrogatepass`와 같은 UTF-8 바이트를 만든다. 짝 없는 서로게이트 U+D800은 `ED A0 80`이 되고 U+FFFD(`EF BF BD`)와 다르다. 해시·검증·없는 계정의 가짜 검증 모두 이 Buffer를 `argon2`에 넘긴다. 결과는 PHC 문자열(`$argon2id$v=19$m=65536,t=3,p=4$…`, 해시 32바이트)이다. 짝 없는 서로게이트 비밀번호로 가입한 계정에 U+FFFD 비밀번호로 로그인하면 401이고, 가입·로그인 어디서도 500이 없다.
- `signAccessToken({ userId, sessionId })`는 HS256 `sub`·`sid`·`iat`·`exp`를 넣는다. `verifyAccessToken`은 jose 서명·만료 검증(`clockTolerance` 30초, 고정 6.2.12 소스의 판정은 `exp ≤ 현재 − 30초`이면 만료) 뒤에 `iat`가 현재보다 30초 넘게 미래면 401 `auth.token_invalid`로 거절한다. 그래서 `exp` 뒤 29초까지는 통과하고 30초부터 `auth.token_expired`다. +5·+30초는 통과, +31·+3600초는 거절, 과거 `iat`와 미래 `exp`는 통과다. 토큰 수명 상한(`maxTokenAge`)은 두지 않는다.
- 만료된 access token은 401 `auth.token_expired`다. 401 응답은 `WWW-Authenticate: Bearer`를 담는다.
- `hashIdentifier(email)`은 `IDENTIFIER_HASH_SECRET` 키의 HMAC-SHA256이다. 로그인 실패 감사 로그와 식별자별 레이트 리밋 키에 쓴다.

### 7.3 소셜 로그인

- 제공자 인터페이스(`google`·`kakao`·`naver`)는 인가 URL, 토큰 교환, 신원 조회, 이메일 검증 여부 판정을 가진다. 운영 URL과 개발 모의 서버(mock-oauth2-server 6.0.3, 28080) URL은 설정이다.
- `OAuth_authorize`는 `redirectUri`가 `OAUTH_REDIRECT_URIS` 중 하나인지, `codeChallenge`가 계약 pattern인지 본 뒤 state(Redis, 1회용)를 만들고 302로 보낸다. `OAuth_callback`은 state를 소비하고 코드를 교환해 신원을 조회한 뒤 1회용 `oauthCode`를 만들어 프론트 콜백으로 302한다. 사용자가 거부하면 `auth.oauth_denied`, 그 밖의 실패는 `auth.oauth_failed`를 리다이렉트 쿼리로 전한다.
- 계정 연결 규칙은 FastAPI(`auth/service/oauth.py`)와 같고 한 트랜잭션이다. (1) `(제공자, subject)`로 연결된 계정이 있으면 그 계정이다. (2) 제공자가 이메일을 검증했으면 같은 이메일 계정에 연결한다. 그 계정이 활성이 아니면 콜백이 `auth.account_deactivated`를 리다이렉트 쿼리로 전한다. 그 계정이 이메일을 인증하지 않은 채 가입한 것이면 그 비밀번호는 이메일 주인이 정한 것인지 알 수 없으므로 지우고 인증 완료로 둔다(선점 가입 막기). 계정이 없으면 인증을 마친 새 계정을 만든다. (3) 이메일이 없거나 검증되지 않았으면 이메일 없는 새 계정을 만든다(미검증 이메일은 저장하지 않는다). 새 계정은 제공자 이름과 `member` 역할이다. 같은 사람이 동시에 돌아와 고유 제약에 걸리면 한 번만 다시 찾는다. 소셜만 쓰는 계정의 비밀번호 로그인과 비밀번호 변경은 401 `auth.invalid_credentials`다.
- `Sessions_create`의 `oauthCode`는 1회용(60초)이고 `codeChallenge`에 묶인다. `codeVerifier`가 RFC 7636 모양(`[A-Za-z0-9._~-]` 43~128자)이 아니면 바로 거절하고, 맞으면 S256 결과를 상수 시간으로 비교한다. 틀리거나 만료·재사용이면 401 `auth.oauth_code_invalid`다. 공격자가 자기 계정으로 받은 코드는 피해자 BFF의 verifier로 풀리지 않아 로그인 CSRF를 막는다.
- 적합성 OAuth 드라이버는 Express의 리다이렉트 텍스트 본문을 이미 허용한다(기존).

### 7.4 내 정보·사용자·역할·권한·감사

- 권한은 코드에 정의된 `PermissionCode` 8개이고 역할은 그 묶음이다(DB, 사용자와 다대다). 실제 권한은 요청마다 역할에서 계산하고 캐시하지 않는다. 역할 부여는 추가만 하고, 빈 목록 부여는 아무것도 지우지 않는다(R7이 시험 fixture의 잘못된 가정을 바로잡았다). 회수는 사용자 역할 갱신(`Users_update`)이 명시한 목록으로 바꿀 때만 일어난다.
- 시스템 역할(admin, member)은 지울 수 없고 admin의 권한은 고칠 수 없다(`role.system_role_protected`). 마지막 활성 admin의 admin 회수·비활성화·탈퇴는 `role.last_admin_protected`다. 자기가 갖지 않은 권한을 포함한 역할을 남에게 주거나 만들 수 없다(권한 상승 금지).
- `Me_get`·`Me_update`(이름·로케일·아바타 파일 참조)·`Me_delete`(재인증, 개인정보 익명화, 상태 `deleted`, 모든 세션 폐기, 아바타 파일 분리). 내 정보가 바뀌면 `me.updated`를 `user:{userId}` 룸에 보낸다.
- `Users_list`(필터 `q`·`status`·`role`, include `roles`·`avatar`, 정렬 `createdAt`·`name`·`email`, `users:read`), `Users_get`, `Users_update`(역할·상태, `users:manage`). 비활성화하면 그 사용자의 세션을 폐기하고 실시간 연결을 끊는다.
- `Roles_list`·`Roles_get`(`roles:read`), `Roles_create`·`Roles_update`·`Roles_delete`(`roles:manage`), `Permissions_list`(`roles:read`, 코드 순 정렬과 역순). 역할 권한이 바뀌면 그 역할을 가진 사용자의 실시간 연결을 재검사한다.
- 감사 로그는 계약의 `AuditLogAction` 13개만 쓰고 원인 행위와 같은 트랜잭션에 기록한다: `session.login_succeeded`, `session.login_failed`, `session.all_revoked`, `user.password_changed`, `user.password_reset`, `user.roles_changed`, `user.deactivated`, `user.reactivated`, `user.deleted`, `role.created`, `role.updated`, `role.deleted`, `post.deleted_by_admin`. 조회는 `AuditLogs_list`(기간 필터)·`AuditLogs_get`(`audit-logs:read`)이다.
- 시드는 시스템 역할, 권한 묶음, `SEED_ADMIN_EMAIL`·`SEED_ADMIN_PASSWORD`의 관리자를 멱등으로 만든다. 저자의 글이 없으면 발행 글 2개와 초안 1개를 만든다.

### 7.5 파일과 스토리지

- `Files_create`는 크기 → 타입 → 한도 순서로 검사해 `pending` 파일을 만들고 `meta.upload`에 presigned PUT(900초)과 그 요청에 쓸 헤더(`Content-Type`만, `Content-Length`는 브라우저가 보낸다)를 담는다. 선언과 다른 크기·타입의 업로드는 스토리지가 서명 불일치로 거절한다.
- `Files_update`로 완료를 알리면 내부 클라이언트의 HEAD로 객체를 확인하고 `ready`로 바꾼다. 객체가 없으면 `file.upload_incomplete`다. `Files_get`은 `downloadUrl`(presigned GET 600초)을 담는다. 같은 파일을 다시 읽어도 안정된 속성을 돌려주며, 새 URL이 이전 URL과 같다는 가정은 하지 않는다.
- 남의 파일은 보지도 고치지도 못한다. 볼 수 있는 글의 커버 이미지는 누구나 읽는다(posts의 읽기 규칙 등록).
- `Files_delete`는 행을 지우고 commit 뒤 객체를 지운다. 글·아바타에서 풀린 파일은 정리 대상이다. 24시간이 넘은 `pending` 파일은 주기 작업 `files.purge_pending`(매시간 정각 UTC)이 지운다.
- `storage-init`은 버킷이 없으면 만들고 CORS를 `STORAGE_ALLOWED_ORIGINS`의 GET·PUT·HEAD, 모든 헤더, `ETag` 노출, maxAge 3000으로 교체한다. `Health_ready`는 DB·Redis·`HeadBucket`을 보고 200 또는 503 `HealthReport`를 낸다.

### 7.6 posts 골든 모듈

- 가시성·전이·필터·검색·정렬·페이지·include(`author`, `coverImage`)·`fields`·이벤트·캐시·감사는 FastAPI 설계 §6.6과 같다. `Posts_create`는 `posts:create`, 남의 글 수정·삭제는 `posts:manage`다. 볼 수 없으면 404, 볼 수 있지만 고칠 수 없으면 403, 허용하지 않는 전이는 `post.invalid_transition`이다.
- 공개 목록의 첫 페이지(필터·`fields` 없음, 기본 정렬, 기본 크기, `include`는 달라도 된다)를 60초 cache-aside로 둔다. 키는 `<prefix>:cache:posts:list:<세대>:<모양 해시>:<정렬한 include>`다. 모양 해시는 응답 문서 Zod 스키마에서 만든 JSON Schema의 SHA-256이라, 모양이 바뀐 배포는 다른 키를 쓴다. 지우기는 세대를 `INCR`로 올린다(SCAN 없음). 채우는 사이에 지워진 값은 옛 세대에 쓰여 읽히지 않는다. `posts:manage`의 요청은 캐시하지 않는다. Valkey에 닿지 못하면 캐시 없이 동작한다. 캐시 수명(60초)은 presigned URL 수명(600초)보다 짧다.
- 글이 생기거나 바뀌거나 지워지면 commit 뒤에 세대를 올리고 이벤트를 보낸다. 관리자가 남의 글을 지우면 `post.deleted_by_admin`을 남긴다.
- 커버 이미지를 바꾸거나 글을 지우면 풀린 파일 행을 같은 트랜잭션에서 정리 대상으로 표시하고 객체는 commit 뒤에 지운다.

### 7.7 잡·메일·scheduler

- 큐는 BullMQ(Valkey). 잡 이름은 `<모듈>.<동사>`(예: `auth.send_verification_mail`), 인자는 `{ id }`뿐이다. 실행할 때 대상을 다시 읽어 보낼 조건을 본다.
- 재시도: 처음 포함 최대 5회, 지연 `min(5000 * n, 60000) + random(0..1000)`ms(n은 재시도 순번). BullMQ의 사용자 정의 backoff로 구현한다. `removeOnComplete: true`, 실패 기록은 남긴다. worker 하나는 Queue와 Worker에 공유 ioredis 연결 하나를 넘긴다(BullMQ가 내부에서 복제하는 차단 연결은 별도).
- 메일 잡(인증, 재설정, 환영)은 토큰이 필요하면 시도마다 새로 발급해 commit한 뒤 SMTP로 보낸다. SMTP 발송은 트랜잭션 밖이다. 실측에서 5회 시도마다 서로 다른 토큰 5개가 나왔고, Mailpit chaos로 첫 발송을 실패시킨 뒤 5913ms 뒤의 재시도가 새 토큰으로 성공했다.
- 메일 템플릿은 모듈의 `templates/<ko|en>/<메일>.{subject.txt,txt,html}`이다. 렌더러는 `{{이름}}` 치환과 HTML 이스케이프만 한다. 하네스 검사가 로케일·형식 누락을 찾는다.
- 주기 작업은 BullMQ Job Scheduler로 선언하고 scheduler 프로세스 하나가 등록한다: `files.purge_pending`(매시간 정각 UTC), `auth.purge_expired`(매일 03:00 UTC, 만료 세션·토큰 정리). 등록은 멱등이다. scheduler를 두 개 띄우는 것은 지원하지 않는다(문서화).

### 7.8 레이트 리밋

- 고정 윈도 카운터다. 엄격 리밋은 Lua 하나로 `INCR`·`EXPIRE NX`·`TTL`을 원자적으로 한다.
- 전역: `/api/` 아래 모든 요청, IP별 분당 `RATE_LIMIT_GLOBAL`(기본 600), 우선순위 1(협상보다 먼저). 엄격: 로그인 IP별 분당 10·식별자별 분당 5, 가입 IP별 시간당 10, 재설정 요청·재발송 IP별 시간당 5·이메일별 시간당 3, 비밀번호 변경 사용자별 시간당 5. 엄격 리밋은 인증·본문 검증 뒤(우선순위 8)에 센다.
- 초과하면 429 `rate_limit.exceeded`, `Retry-After`(초), `meta.retryAfter`.
- 클라이언트 IP는 직접 연결 주소가 `FORWARDED_ALLOW_IPS`에 있을 때만 `X-Forwarded-For`를 따른다. `*`는 거절한다(설정 오류). 신뢰하지 않는 전달 헤더는 무시한다.
- Valkey에 닿지 못하면 전역·엄격 모두 통과시킨다(fail-open)고 로그를 남긴다.
- 실측: 한도 10에 동시 20개 → 10개 허용·10개 거절, TTL 60초.

### 7.9 실시간

- 게이트웨이는 `/socket.io`, WebSocket 전송만 받는다(polling 거절). `IoAdapter` 하위 클래스가 Origin을 `REALTIME_ALLOWED_ORIGINS`(정규화한 목록)와 문자 그대로 비교하고, Origin 헤더가 없으면 받는다(브라우저 밖 클라이언트).
- 연결 인증은 `RealtimeTickets_create`가 발급한 티켓이다. 티켓은 무작위 값의 다이제스트를 키로 30초 저장하고 연결 때 `GETDEL`로 한 번만 쓴다. 틀리거나 만료되면 `connect_error`의 `data`가 ErrorObject(`auth.token_invalid`, status 401)다. 티켓 없는 연결은 익명이다.
- 룸: 로그인 소켓은 `user:{userId}`에 자동으로 들어간다. `subscribe`·`unsubscribe`는 페이로드 하나(`RealtimeSubscription`)만 받는다. 페이로드가 없거나 둘 이상이면 `validation.invalid_choice`, 모르는 채널도 `validation.invalid_choice`, `posts:all`에 권한(`posts:manage`)이 없으면 `permission.denied`다. 처리기는 늘 `RealtimeAck`를 돌려준다(null을 돌려주면 ack가 가지 않는 고정 버전 동작 때문). 권한 없는 unsubscribe는 성공한다.
- 7개 이벤트는 계약의 `rooms`·`conditionalRooms`대로 보낸다. 발행 취소는 `posts`에 `post.unpublished`(식별자만), `posts:all`에 `post.updated`다.
- 다중 인스턴스: api는 Redis 어댑터, worker·scheduler는 emitter로 보낸다. emitter는 installed 5.1.0이 Redis publish Promise를 버리므로 publish 포트를 감싸 완료·거부를 기다린다(R11). api 분기는 `server.to(rooms).emit` 뒤 어댑터 publisher `PING`으로 전송을 확인한다.
- 재검사: 로그아웃·세션 폐기·비활성화·역할 권한 변경은 `<prefix>:control` 채널에 재검사 명령을 publish한다. 모든 api 인스턴스가 해당 사용자의 소켓을 다시 검사해 세션이 폐기됐으면 `io server disconnect`로 끊고, `posts:all` 권한이 사라졌으면 그 룸에서 빼거나 끊는다. 같은 사용자의 다른 세션 연결은 남는다. DB를 읽지 못하면 연결을 유지한다(fail-open)고 로그를 남긴다.
- 실측: 다른 api 인스턴스의 로그아웃이 소켓을 끊고 다른 세션은 남았다. 소켓당 룸 3개, 프로세스 3개의 api 2·emitter 1 구성에서 이벤트가 각각 한 번씩 왔다.

### 7.10 설정·보안 기본값·로케일

- 설정은 Zod 스키마 하나(`settingsSchema`)다. 모든 값이 필수이고 개발 값은 `.env.example`에 있다. 없거나 틀린 값은 `설정 오류: <키> — <이유>`를 키마다 한 줄씩 알리고 시작하지 않는다.
- `.env.example`의 키는 FastAPI의 50개와 같고, Node에서 필요한 두 키를 더한다: `PORT`(uvicorn은 명령 인자로 받는다), `FORWARDED_ALLOW_IPS`(uvicorn은 같은 이름의 환경 변수를 직접 읽는다). `APP_ENV`(`development`·`test`·`production`)가 동작 모드를 정하고 `NODE_ENV`는 이미지에서 라이브러리 최적화용으로만 둔다. `DATABASE_URL`의 형식은 `postgresql://`이다(FastAPI는 `postgresql+psycopg://`).
- 운영(`APP_ENV=production`)에서는 `JWT_SECRET`·`IDENTIFIER_HASH_SECRET`·`SEED_ADMIN_PASSWORD`가 `.env.example`의 값이면 시작하지 않는다. CORS는 HTTP API에 열지 않는다(BFF가 같은 출처에서 부른다). Socket.IO와 스토리지만 허용 Origin 목록을 쓴다.
- 에러 문장은 번역하지 않는다. 메일 템플릿과 사용자 로케일(`ko`·`en`)만 다국어다.
- 하네스의 `.env.example` 검사가 설정 스키마의 키 집합과 파일의 키 집합이 같은지 본다.

### 7.11 관측성

- 로그는 Nest `ConsoleLogger`의 JSON 출력을 쓰는 `JsonLogger`다. 요청 문맥(AsyncLocalStorage)의 `traceId`를 모든 줄에 넣는다. 접근 로그는 메서드, 경로(쿼리 문자열 제외), 상태, 지연(ms), traceId를 한 줄로 쓰고 헬스체크 경로는 남기지 않는다. 예외는 스택을 포함한 한 줄 JSON이다.
- OTel은 기본 꺼짐(`OTEL_ENABLED=false`)이다. 켜면 `node --import ./dist/core/telemetry/register.js`가 SDK를 먼저 시작한다. 헬스체크 경로는 HTTP 계측의 무시 규칙으로 span을 만들지 않는다.
- 수용 게이트: 인증된 JSON:API 요청 하나(DB와 Redis를 쓰는 요청)에 대해 HTTP 서버 span, Express 또는 명시 핸들러 span, pg span, ioredis(또는 명시 Redis) span이 각각 1개 이상이고 모두 같은 trace에 있으며, 헬스체크 요청은 span 0개여야 한다. 프로토타입은 HTTP 1·Express 0·pg 6·ioredis 0으로 이 게이트를 통과하지 못했다.
- 구현: 실측으로 동작한 HTTP(1)·pg(6)는 고정한 계측 라이브러리를 그대로 쓴다. 실측 0이었던 Express와 ioredis는 라이브러리 계측에 기대지 않고 자기 경계에 명시 span을 만든다. 처리기 span은 operation 인터셉터가 `<METHOD> <route template>`(속성 `http.route`, `aitpl.operation_id`)로, Redis span은 `RedisClients`가 만든 모든 연결의 `sendCommand`를 감싸 `redis <COMMAND>`(속성 `db.system`=`redis`, 키 값은 넣지 않음)로 만든다. BullMQ·Socket.IO 어댑터의 명령도 같은 연결을 쓰므로 함께 덮인다. ESM loader hook은 쓰지 않는다. 명시 span은 계측이 꺼져 있으면 비용이 없는 no-op tracer를 쓴다.
- CI의 계측 시험이 위 게이트를 통과해야 `nestjs` 작업이 성공한다. 이 게이트는 제품 수용 조건이며 프로토타입의 비차단 규칙을 물려받지 않는다.

## 8. 하네스

### 8.1 명령 어휘

| 명령                                        | 하는 일                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm setup`                                | `node scripts/setup.mjs`: 고정 의존성 설치(`--frozen-lockfile`), `.env` 준비(없으면 복사, 있으면 없는 키만 추가), git 최상위면 lefthook 설치, Betterleaks 고정 바이너리 확인, compose 인프라 기동·대기, DB 셋(`app`·`app_test`·`app_e2e`) 생성, `prisma generate`, 세 DB migrate, 버킷·CORS 준비, 개발 DB 시드 |
| `pnpm dev`                                  | api(SWC watch, api만 재시작)·worker·scheduler를 함께 띄우고 출력 앞에 이름을 붙인다. 하나가 죽으면 모두 내린다                                                                                                                                                                                                 |
| `pnpm check [--fast]`                       | §8.2의 단계. 성공하면 한 줄, 실패하면 실패 단계의 출력만 보인다                                                                                                                                                                                                                                                |
| `pnpm fix`                                  | Prettier와 자동 수정 가능한 ESLint                                                                                                                                                                                                                                                                             |
| `pnpm test`                                 | 단위와 통합 시험(E2E 제외). 통합은 인프라가 필요하다                                                                                                                                                                                                                                                           |
| `pnpm test:e2e`                             | 빌드한 `dist`로 api·worker·scheduler를 실제 프로세스로 띄워 `tests/e2e` 흐름을 돌리고 내린다                                                                                                                                                                                                                   |
| `pnpm e2e:serve [--web-url URL] [-- 명령…]` | §9.3. 루트 조합 실행기와 프론트 E2E가 쓴다                                                                                                                                                                                                                                                                     |
| `pnpm gen [--check]`                        | Prisma 클라이언트와 `openapi.json`을 만든다. `--check`는 차이가 있으면 1                                                                                                                                                                                                                                       |
| `pnpm db:migrate`                           | 개발 DB에 마이그레이션을 적용한다(가드 뒤)                                                                                                                                                                                                                                                                     |
| `pnpm db:reset`                             | 로컬 개발 DB를 지우고 다시 만든다(로컬 호스트만)                                                                                                                                                                                                                                                               |
| `pnpm db:revision <이름>`                   | create-only 마이그레이션 초안                                                                                                                                                                                                                                                                                  |
| `pnpm gen:module <이름>`                    | §8.5                                                                                                                                                                                                                                                                                                           |

`package.json`에는 이 밖에 `build`(`nest build -b swc`)가 있다.

### 8.2 check 단계

순서: `format`(Prettier `--check`) → `gen`(Prisma 생성 + `openapi.json` 재생성 비교) → `lint`(ESLint, 경계·프로젝트 규칙) → `typecheck`(`tsc --noEmit`) → `harness`(파일 크기, 억제 주석 사유, `.env.example` 대조, 메일 로케일, 지침 짝, 생성물 미추적, 아직 없는 명령 금지) → `api-style`(`openapi.json` 룰셋) → `test`(단위, `--fast`가 아니면 통합까지).

- 단계마다 입력 파일 해시와 명령을 `.cache/check/`에 저장하고, 마지막 성공 이후 입력이 같은 단계는 건너뛴다. `--fast`는 통합 시험을 빼고 바뀐 모듈의 단위 시험만 돈다(Stop hook용).
- 통합 시험 단계는 인프라(PostgreSQL·Valkey·SeaweedFS·Mailpit)에 먼저 닿아 보고, 닿지 못하면 "pnpm setup을 실행하라"로 실패한다.
- 파일 크기: 소스 400줄, 시험 600줄. 생성물(`src/generated/**`, `openapi.json`, `prisma/migrations/**`)은 제외한다.
- 억제 주석(`eslint-disable`, `@ts-expect-error`)은 같은 줄에 `-- 사유`가 있어야 한다. TypeScript 파서의 주석 범위로 찾으며, 인라인 disable이 있어도 검사는 계속된다.

### 8.3 기계적 강제와 음성 fixture

- strict TypeScript(`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), typescript-eslint의 타입 인식 규칙, `consistent-type-imports`(데코레이터 생성자의 값 import는 자동 수정이 보존한다).
- boundaries: core → modules 금지, 모듈 사이는 `index.ts`만, 생성 Prisma import는 `repository.ts`·`core/db`만, 시험 전용 헬퍼는 시험에서만.
- 프로젝트 규칙: `$queryRawUnsafe`·`$executeRawUnsafe` 금지, 컨트롤러에서 Prisma 직접 사용 금지, `process.env` 직접 읽기는 `core/config`만, `console.*` 금지(로거 사용).
- `scripts/lint/fixtures/`의 음성 fixture(규칙마다 위반 1개 이상)와 양성 fixture가 규칙을 고정한다. 프로토타입은 음성 22개·양성 18개였다. boundaries 7.2의 `mode` 서술자 사용 중단 경고는 `partialMatch` 설정으로 옮겨 없앤다.

### 8.4 Claude Code hooks와 위험 명령

`.claude/settings.json`은 네 이벤트를 node exec form(`["node", ".claude/hooks/<이름>.mjs"]`)으로 선언한다.

| hook         | 동작                                                                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostToolUse  | 편집한 파일에 Prettier와 ESLint(자동 수정)를 돌리고 남은 문제를 돌려준다                                                                                                                                                                                                                                            |
| Stop         | `stop_hook_active`면 통과, 아니면 `pnpm check --fast`. 해시 캐시 덕분에 바뀐 것이 없으면 즉시 통과한다                                                                                                                                                                                                              |
| PreToolUse   | `.env` 읽기·쓰기, `src/generated/**`·`openapi.json` 편집, 커밋된 `prisma/migrations/*/migration.sql` 편집, `npx prisma`·`pnpm dlx`·`npx`로 고정하지 않은 도구 실행, `prisma db push`, `prisma migrate reset`(로컬 아닌 대상), `--accept-data-loss`, `--no-verify`, `git push --force`를 막고 이유와 대안을 돌려준다 |
| SessionStart | 명령 어휘와 현재 상태(설치·`.env`·인프라)를 짧게 알린다                                                                                                                                                                                                                                                             |

git hook(lefthook): pre-commit은 스테이징한 TS 파일의 Prettier(고친 결과 다시 스테이징)·ESLint와 Betterleaks(`git --pre-commit --staged --redact`), pre-push는 `pnpm check`다. Betterleaks는 `scripts/tools/betterleaks.ts`가 루트·FastAPI·Next.js와 같은 1.8.1 바이너리를 SHA-256으로 확인해 `.cache/tools/`에 받는다. 템플릿 `.betterleaks.toml`은 기본 규칙에 `pnpm-lock.yaml`의 `@inquirer/password` 줄과 `openapi.json`만 좁게 예외로 둔다.

### 8.5 gen:module, 레시피, skill, 문서

- `gen:module <이름>`은 골든 posts 모듈을 복사해 이름을 바꾸고(파일·클래스·리소스 타입·권한 코드·이벤트 이름), 등록부·앱 모듈·`schema.prisma`의 모델 블록·권한 목록에 등록하고, 단위 시험을 함께 만든다. DB에는 닿지 않고 다음 단계로 `pnpm db:revision create_<이름>`을 안내한다. 계약에 없는 새 리소스이므로 생성물은 `openapi.json`에 들어가고 계약 비교에서는 제외 목록이 아니라 실패로 드러난다(새 리소스는 먼저 계약에 더한다는 규칙을 레시피에 적는다).
- 레시피 `docs/recipes/`: FastAPI와 같은 이름의 `module.md`, `endpoint.md`, `migration.md`, `job.md`, `permission.md`, `mail-template.md`, `realtime-event.md`. 템플릿 `.github/workflows/ci.yml`은 생성한 단독 프로젝트의 CI(setup·check·test:e2e·이미지)다. skill `.claude/skills/nestjs-backend/SKILL.md`가 레시피를 짧게 이끈다. Nest 공식 agent skill은 확인된 것이 없어 저장소 레시피만 둔다.
- `AGENTS.md`(명령, 규칙, 금지)와 `CLAUDE.md`(`@AGENTS.md`), `docs/architecture.md`(모듈 지도, 파이프라인, 트랜잭션, 잡, 실시간, 관측, FastAPI와 다른 점), `docs/stack.md`(고정 버전, 알려진 제한).

## 9. 실행·배포·프로세스 소유

### 9.1 compose

`compose.yaml`은 FastAPI와 같은 인프라 이미지와 포트를 쓴다: PostgreSQL 18.6-alpine(25432, TCP `pg_isready`), Valkey 9.1.2(26379), SeaweedFS 4.47 mini(28333), Mailpit v1.31.2(SMTP 21025·UI 28025), mock-oauth2-server 6.0.3(28080). 최상위 `name`은 두지 않는다. `app` 프로필은 이미지로 `migrate`·`storage-init`·`api`(Node `fetch` 헬스체크)·`worker`·`scheduler`를 띄우고, `observability` 프로필은 LGTM이다.

### 9.2 이미지

`Dockerfile`은 다단계다. 빌드 단계는 `node:24.19.0-bookworm-slim`에 pnpm 12.6.0으로 frozen 설치, 연결하지 않는 `DATABASE_URL`로 `prisma generate`, SWC 빌드를 한다. 실행 단계는 운영 의존성만 설치하고 UID·GID 10001로 돈다. HEALTHCHECK는 두지 않는다(compose와 플랫폼이 정한다). 실측 713,108,263바이트(단독 생성 713,108,278바이트)는 기록이며 임의의 상한을 정하지 않는다.

### 9.3 e2e:serve

FastAPI 계약을 그대로 따른다.

- 옵션 `--web-url <URL>`, `--` 뒤의 명령은 그대로 실행한다. 명령의 작업 폴더는 `INIT_CWD`(조합 루트에서 부르면 그 폴더)다.
- 서버는 빌드한 `dist`로 띄운다(api는 127.0.0.1:18000). DB `app_e2e`, Valkey DB 14. 시작 전에 `app_e2e`를 비우고 migrate·시드한다.
- 자식 명령 환경: `E2E_API_URL=http://127.0.0.1:18000`, `E2E_WEB_URL`, `E2E_MAILPIT_URL=http://127.0.0.1:28025`, `E2E_OAUTH_URL=http://127.0.0.1:28080`, `E2E_RECENT_LOGIN_SECONDS=10`, `E2E_SEED_ADMIN_EMAIL`·`E2E_SEED_ADMIN_PASSWORD`. CORS·실시간·스토리지 허용 Origin에 web URL을 더한다.
- 준비: 60초 안에 api `/health/ready` 200, worker·scheduler의 준비 기록(§9.4)이 모두 와야 한다. 넘으면 각 프로세스의 출력 끝 8192자를 비밀 값을 가린 채 보이고 1로 끝난다.
- 명령의 종료 코드를 그대로 돌려주고, 신호(SIGINT·SIGTERM)를 받으면 자식을 정리한 뒤 130·143으로 끝난다.

### 9.4 교차 플랫폼 프로세스 소유와 정리

프로토타입의 Darwin 실패는 `process-tree`의 신호 함수가 그룹 `kill`의 EPERM을 그대로 던진 데서 났다(종료 중이거나 회수 전 구성원만 남은 그룹). 원인 후보는 Darwin의 회수 시점이지만 확정되지 않았다. 제품 규칙은 다음과 같다.

- 소유: 직접 띄운 자식만 정리한다. POSIX는 `detached`로 새 그룹의 리더가 되고 리더 PID를 기록한다. Windows는 node를 직접 띄워 `taskkill /PID <pid> /T /F`로 자식 트리를 정리한다. 이름·포트로 찾아 죽이지 않는다.
- 준비: 서버는 신호·종료 처리기를 먼저 설치한 뒤 `listen` 콜백에서 준비 기록(PID 포함)을 쓴다. 실행기는 기록이 모두 올 때까지 기다린다. worker는 BullMQ `waitUntilReady()` 뒤, scheduler는 Job Scheduler 등록 뒤 준비 기록을 쓴다.
- 종료: SIGTERM → 유예 5000ms → SIGKILL → 2000ms. 서버는 SIGTERM에서 `server.close()` 뒤 `closeAllConnections()`로 대기 중인 연결도 닫는다.
- ESRCH와 EPERM: `ESRCH`는 종료다. Darwin의 그룹 신호·생존 확인에서 EPERM이 오면 그 오류를 기억하고 같은 유예 시간 안에서 생존 확인을 계속한다. 유예 안에 ESRCH가 되면 성공이고, 유예가 끝날 때까지 EPERM이면 기억한 원래 EPERM 오류를 그대로 던진다. Linux·Windows의 EPERM은 즉시 실패다. 추가 재시도·대기 연장·오류 삼킴은 없다.
- 이 수정은 공유 원본 `shared/nextjs/scripts/process-tree.mjs`에 하고 sync한다. web·admin 실행기도 같은 함수를 쓰므로 세 템플릿 check를 차례로 돌린다. 신호 함수와 시계·대기는 주입 가능한 의존성으로 만들어 EPERM→ESRCH, EPERM 지속, Linux EPERM, Windows 분기를 결정적으로 시험한다.
- 정리 증거는 기록한 소유 PID·그룹에 대한 `kill(…, 0)`의 ESRCH로만 주장한다. 기록하지 않은 중첩 자식이나 과거 모든 PID의 종료는 주장하지 않는다.

## 10. 루트 통합

### 10.1 verify-templates, 공유 자산, 지침

- `verify-templates`는 이미 `runner: "pnpm"`을 읽는다. backend 명령(`db:migrate`·`db:reset`·`e2e:serve`)과 hook·필수 파일·공유 사본 검사가 `templates/nestjs`에 그대로 적용된다.
- [dependencies.ts](../../../scripts/src/verify-templates/dependencies.ts)에 백엔드·프론트 공통 의존성 가드를 더한다. `templates/nestjs/package.json`과 각 프론트의 `dependencies`·`devDependencies`에 함께 있는 패키지는 같은 버전이어야 하고, `pnpm-workspace.yaml`의 `minimumReleaseAge`·`overrides`는 같아야 하며, `allowBuilds`는 같은 키의 값이 다르면 문제로 알린다(합집합은 허용). 조합이 잠금 파일 하나를 공유하므로 이 가드가 생성 실패를 템플릿 단계에서 미리 잡는다.
- [shared-assets.json](../../../scripts/shared-assets.json): `.gitattributes`·`.editorconfig`·`contract/api-style/dist/lint.mjs`에 nestjs 대상을 더하고, 새 항목 `shared/nextjs/scripts/process-tree.mjs` → `templates/nestjs/scripts/process-tree.mjs`를 둔다.
- 루트 `AGENTS.md`의 구조·명령 표, `.betterleaks.toml`의 잠금 파일 예외 경로(`^templates/(?:nextjs(?:-admin)?|nestjs)/pnpm-lock\.yaml$`)를 갱신한다. `openapi.json`은 기존 prefilter(`^templates/[^/]+/openapi\.json$`)가 이미 덮는다.

### 10.2 적합성 대상 nestjs

[conformance 대상](../../../scripts/src/conformance/targets.ts)에 `nestjs`를 더한다. `templates/nestjs/compose.yaml`의 `app` 프로필을 compose 프로젝트 `nestjs`로 띄우고(개발 인프라와 같은 프로젝트), migrate·시드 뒤 api 8000·Mailpit 28025·OAuth 28080·시드 관리자로 14개 흐름 파일 94개 사례를 돌린 뒤 내린다. `--keep`과 흐름 파일 인자는 FastAPI와 같다. 선택 실행(프로토타입의 41개 선택과 그 selector)은 제품에 두지 않는다. 기존 결과 해석·응답 Ajv 검증·정확한 Content-Type 검사는 바꾸지 않는다.

### 10.3 프론트 E2E 대상 nestjs와 루트 실행기

- 공유 원본 [targets/index.ts](../../../shared/nextjs/e2e/targets/index.ts)의 `TargetName`에 `"nestjs"`를 더한다. NestJS는 실제 백엔드라 FastAPI와 같은 어댑터(Mailpit 메일 링크, 재인증 창 대기, mock-oauth2-server)를 쓴다. 앱 소유 파일(web `e2e/targets/app.ts`·`social.ts`, admin `fixtures.ts`)은 `name === "fastapi"`로 실제 백엔드 분기를 고르므로, 공유 `index.ts`가 앱 훅에 넘기는 이름을 `adapterName(name)`(`mock`이면 `mock`, 그 밖은 `fastapi`)으로 정규화하고 `E2E_TARGET` 출력은 실제 이름(`nestjs`)을 유지한다. 앱 소유 파일은 바꾸지 않는다. 백엔드 공통 환경 값은 앱 훅 없이 만드는 `backendEnvironment`로 나눠 공유 시험이 앱마다 다른 필수 키에 기대지 않게 한다. 환경 검사 문구는 백엔드 이름을 넣어 일반화하고 공유 시험을 함께 고친다.
- 순서: 공유 원본 편집 → `git add` → `pnpm sync` → `pnpm fix:shared <파일…>` → `pnpm sync`. web·admin check는 빌드 산출물을 공유하므로 차례로 돈다. web 경고 17개·admin 0개 기준선은 그대로여야 한다.
- 루트 [web-e2e 실행기](../../../scripts/src/web-e2e/README.md)는 `fastapi|nestjs` 백엔드 인자를 받는다. NestJS는 전용 compose `scripts/compose/nextjs-e2e-nestjs.yaml`·`nextjs-admin-e2e-nestjs.yaml`, 프로젝트 `ai-template-<app>-nestjs-e2e-<ID>`, 이미지 `ai-template-<app>-e2e-nestjs:<ID>`를 쓰고 포트는 FastAPI 스택과 같다(그래서 동시에 띄우지 않는다. 포트 검사가 거절한다). `--smoke`·`--print`·`--keep`·`--run-id`·`--down`을 모두 지원한다. 사전 namespace guard는 `projectName(runId, app, backend)`로 백엔드를 포함해 비교한다(R13). 같은 실행 ID의 컨테이너·볼륨이 있으면 기동·정리를 거부하고, 성공과 `--down`은 그 스택·볼륨·정확한 이미지 태그만 정리한다. 개발 프로젝트 `fastapi`·`joon`·`nestjs`는 건드리지 않는다.
- web 앱의 `login-form.test.tsx` 마지막 성공 문구 부재 assertion을 `await waitFor(...)`로 감싼다. 기존 `create-combo`에서 929/930으로 드러난 비동기 경쟁(R38)이며 제품 동작·문구·다른 assertion은 바꾸지 않는다.

### 10.4 생성 CLI

- 백엔드 서술자([프로토타입 backends.ts](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/create/src/backends.ts)): `Backend = "fastapi" | "nestjs"`, `BackendDescriptor { template, ownsPackageJson, setupTools, apiDockerfile: "app-context" | "root-context", reservedName }`, `backendOf(apiFolder)`(`apps/api/pyproject.toml`이 있으면 fastapi). 인자: `--template nestjs`, `--api fastapi|nestjs`. 예약 이름은 단독·조합 모두 `nestjs`(FastAPI의 `fastapi`와 같은 이유), 조합의 `api`·`web`·`admin`.
- 단독: 추적 파일 복사, compose 맨 앞의 설명 주석과 `name: <이름>` 삽입, 앱 이미지 값의 바이트 범위 교체(FastAPI와 같은 규칙), 첫 커밋, `pnpm setup` 안내. 앱 문맥 Dockerfile을 그대로 쓴다.
- 조합: NestJS api는 자기 `package.json`을 유지하고 `name`만 `api`로 바꾼다. API 이미지 변환은 기존 프론트 단계 선택 뒤에 한다(R18). 조합 API는 루트 문맥 Dockerfile(`apps/api/Dockerfile`, `apps/api/Dockerfile.dockerignore`)을 쓴다. 이 Dockerfile은 `pnpm install --frozen-lockfile --filter api...`로 api와 그 의존성만 설치·빌드하고, 실행 단계도 `--prod --filter api...`로 설치해 프론트 패키지를 넣지 않는다. 프로토타입의 전체 workspace 설치 이미지는 1.109GB(단독 0.713GB의 1.55배)였다. 수용 시험은 이미지 안에서 `next` 해석이 실패하고 api가 시작하며 크기를 기록하는 것이다.
- 조합 자산: FastAPI 바이트를 기준 자산으로 두고, NestJS 변형은 자산별로 선언한 정확한 치환 목록(`find`가 정확히 한 번 나와야 하고 아니면 `CreateError`)으로 만든다. 프로토타입의 되돌리기 편집 방식은 쓰지 않는다. 런타임 판정(`setup.mjs`의 uv 확인, `frontend-e2e.mjs`의 `E2E_TARGET`)은 `backendOf`로 한다. FastAPI 세 조합의 출력 바이트·실행 권한(web 69·admin 68·both 85파일, 골든 31,580바이트)은 편집 전 기준과 바이트로 비교하며 자동 재생성하지 않는다.
- 공유 계약: 첫 프론트의 `contract/*`를 조합 루트에 한 번 복사하고 각 앱 `gen.config.json`은 `../../contract`를 가리킨다(R40).

잠금 정책(최종):

1. 원래 API workspace와 잠금을 먼저 보관하고, 프론트만의 workspace(API 패키지와 빌드 정책 제외)와 원래 프론트 잠금의 엄격 병합으로 `pnpm install --lockfile-only`를 한 번 한다(R35).
2. 즉시 모든 원래 프론트의 importer·패키지·snapshot·해석이 보존됐는지 검증한다.
3. 최종 API+프론트 workspace와 `allowBuilds` 합집합(같은 키의 값 충돌은 거절)을 복원하고, 해석된 프론트 잠금에 원래 API 잠금을 그대로 더한다(`mergeApiLock`). API importer `.`는 `apps/api`가 된다.
4. TypeScript override(6.0.3)에서 파생되는 차이만 허용한다: 원래 API importer 지정자와 해석 버전이 프론트 pin과 같을 때의 `{typescript: 6.0.3}` 메타데이터 추가(R19), 그리고 공유 API 레코드의 기존 문자열 peer `typescript`만 pin으로 바꿨을 때 전체 객체가 같아지는 경우의 메모리 정렬(R39, 실측은 typescript-eslint 8.71.0 계열 5개 레코드의 `>=4.8.4 <6.1.0`). 원본 잠금 파일은 쓰지 않는다. peer 추가·삭제, 다른 peer, engines, integrity, `peerDependenciesMeta`, 두 번째 변화는 모두 실패다.
5. API 전용 snapshot의 optional 플래그만 필수·선택 그래프 도달성으로 판정한다(R14). 그래프가 없거나 깨졌거나, peer 한정 의존 간선·integrity·프론트 해석이 다르면 실패다.
6. 모든 원본 API·프론트 레코드를 frozen 설치 전에 검증하고 `pnpm install --frozen-lockfile` 뒤에 다시 검증한다. 원래 도구 문서 직렬화(앞 4,555바이트)를 보존한다(R16). frozen 설치를 끄거나 패키지 관리자 정책을 낮추지 않는다.

R1·R2 결정:

- R1(생성 뒤 resolving add·update가 공유 잠금의 다른 importer를 다시 해석하는 위험): 조합은 잠금 하나를 공유한다. 생성 시점에는 위 엄격 보존을 지키고, 생성 뒤에는 프로젝트가 의존성을 소유한다. 해석이 바뀌어도 프로젝트의 `pnpm check`(모든 앱의 check·빌드)가 수용 기준이다. CI 수용 시험: 생성한 both 조합에서 `pnpm --filter api remove nodemailer` 뒤 `pnpm --filter api add -E nodemailer@10.1.0`으로 실제 resolving 갱신을 일으키고, 프론트 importer 해석 변화 보고서를 산출물로 남긴 뒤 `pnpm install --frozen-lockfile`·`pnpm check`·web·admin 빌드가 통과해야 한다. 변화가 있어도 보고서는 사실대로 남기고, 검사가 실패하면 실제 비호환으로 CI가 실패한다.
- R2(기본 숨은 hoist가 API 전용 런타임 의존성을 프론트 의존성에 도달시키는 위험): pnpm 기본 hoist를 유지한다(workspace 전역 설정이라 프론트만 다르게 둘 수 없다). CI 수용 시험: (1) hoist 그림자 감사 — 생성한 both 조합과 같은 커밋으로 만든 단독 web의 `node_modules/.modules.yaml`의 숨은 hoist 이름→버전을 비교해, 단독 web이 hoist하는 이름의 버전이 조합에서 다르면 실패하고, 조합에만 있는 API 전용 이름은 개수와 목록을 보고한다. (2) 조합의 web·admin 전체 check·빌드와 NestJS 백엔드 브라우저 E2E(web 20·admin 18).
- 이 두 시험이 실패하면 범위를 좁힌 수정으로 고친다. API를 별도 잠금의 격리 프로젝트로 두는 대안은 조합 실행기·turbo·FastAPI와 같은 자산을 갈라야 하고 측정되지 않았으므로 채택하지 않는다. 시험이 실패한 원인이 공유 잠금 구조 자체로 확인될 때만 별도 판정으로 검토한다.

### 10.5 CI 작업

| 작업                       | 바뀜                          | 증명하는 것                                                                                                                                                                 |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check`                    | 단계 추가                     | 루트 11단계, `spec-compare`(FastAPI 기존 + NestJS 전체), NestJS 컴포넌트 구조 비교(126개, 설명 못 한 차이 0), betterleaks git 스캔, actionlint(템플릿·조합 워크플로 포함)   |
| `fastapi`                  | 없음                          | FastAPI 무회귀                                                                                                                                                              |
| `nextjs`                   | 없음(공유 사본 갱신의 영향만) | web check·mock E2E·이미지                                                                                                                                                   |
| `nextjs-admin`             | 없음(공유 사본 갱신의 영향만) | admin check·mock E2E·이미지                                                                                                                                                 |
| `nextjs-e2e-fastapi`       | 없음                          | web 20개 × FastAPI                                                                                                                                                          |
| `nextjs-admin-e2e-fastapi` | 없음                          | admin 18개 × FastAPI                                                                                                                                                        |
| `conformance-fastapi`      | 없음                          | 94개 × FastAPI                                                                                                                                                              |
| `conformance-mock`         | 없음                          | 94개 × 목                                                                                                                                                                   |
| `create-combo`             | 없음                          | FastAPI 조합 무회귀                                                                                                                                                         |
| `create-standalone`        | NestJS 추가                   | 단독 NestJS 생성·setup·check(기존 fastapi·nextjs·admin과 함께)                                                                                                              |
| `nestjs`                   | 새 작업                       | 템플릿 setup·check(통합 포함)·test:e2e·이미지 빌드·UID·이미지 안 api 시작·OTel 계측 게이트·마이그레이션 drift                                                               |
| `conformance-nestjs`       | 새 작업                       | 94개 × NestJS                                                                                                                                                               |
| `nextjs-e2e-nestjs`        | 새 작업                       | web 20개 × NestJS 전용 스택, 정리                                                                                                                                           |
| `nextjs-admin-e2e-nestjs`  | 새 작업                       | admin 18개 × NestJS 전용 스택, 정리                                                                                                                                         |
| `create-combo-nestjs`      | 새 작업                       | both 조합의 실제 setup·check·test:e2e(api→admin→web)·이미지·컨테이너, web만·admin만 조합의 dry(Node 시험과 turbo dry JSON), R1·R2 수용 시험, 생성 Git clean, 소유 자원 정리 |

PR CI는 전체 구현·검토·마지막 수정 묶음이 끝난 뒤 한 번 전체로 돌고, MAIN fast-forward 뒤 정확한 MAIN CI가 다시 돈다. 프로토타입의 Task마다 전체 CI 규칙은 SDD Task마다 적용하지 않는다.

## 11. FastAPI와 다른 점

템플릿 `docs/architecture.md`의 "FastAPI와 다른 점" 절에 아래를 관측한 한계와 함께 적는다. 모두 적합성 흐름 94개가 다루지 않는 입력이다. 계약 실패를 이 목록으로 무시하지 않는다. 적합성 사례가 이 차이 때문에 실패하면 차이가 아니라 결함으로 고친다.

| 입력                     | NestJS                                                               | FastAPI                                      | 이유와 한계                                                                                           |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 정수 자리의 `10.0`·`1e3` | 정수 10·1000으로 받는다                                              | 422 `validation.invalid_format`(strict 정수) | `JSON.parse`가 `10`과 구별하지 못한다. 목 서버와 같다. JS 클라이언트는 이런 표기를 보내지 않는다      |
| 2^53을 넘는 정수 표기    | 가장 가까운 double로 읽는다(`9007199254740993` → `9007199254740992`) | 정확한 정수                                  | IEEE 754. 계약의 int64 값(파일 크기 등)은 설정 한도 안이라 안전 범위다                                |
| 본문의 `NaN`·`Infinity`  | 400 `jsonapi.invalid_document`                                       | Python `json`이 받아들인 뒤 검증             | JSON 문법 밖이다. 목 서버와 같다                                                                      |
| 끝 슬래시 경로           | 404                                                                  | 307 리다이렉트                               | strict routing. 목 서버와 같다                                                                        |
| GET 라우트에 HEAD        | 404(헬스체크 포함 모든 경로)                                         | 404                                          | 같다. Express는 GET 처리기로 HEAD를 받으므로 파이프라인이 라우팅 전에 막는다. 목 서버(200)와는 다르다 |
| 설정 `DATABASE_URL`      | `postgresql://`                                                      | `postgresql+psycopg://`                      | 드라이버 표기                                                                                         |
| 설정 키                  | FastAPI 50개 + `PORT`·`FORWARDED_ALLOW_IPS`                          | 50개(포트와 프록시는 uvicorn 인자·환경)      | 실행 서버 차이                                                                                        |

## 12. 검증 전략과 수용 기준

- 단위: 순수 로직(권한 판정과 권한 상승 규칙, 전이 표, 쿼리 파서, 페이지 링크, 레이트 리밋 계산, 제공자별 신원 판정, 비밀번호 바이트, 토큰 시각, 잠금 병합, 프로세스 정리 분기). DI 그래프는 인프라 없는 `createApp`으로 컴파일·init·close한다. 인프라가 필요 없다.
- 통합: 실제 PostgreSQL·Valkey·SeaweedFS·Mailpit. API 단위 흐름, 경쟁(refresh 10개, 한도 20개, 마지막 admin), 쿼리 수, 잡 재시도, 실시간 다중 인스턴스, 레이트 리밋, 스토리지 서명 거절, 수명 주기의 명시적 close와 listener 경고 0.
- 프로세스 E2E: 빌드한 api·worker·scheduler를 실제 프로세스로 띄워 가입→메일→인증→로그인→발행(별도 worker 프로세스의 commit과 Socket.IO 전달)→업로드 23바이트→내려받기를 본다.
- 적합성: 94개. 프론트: web 20·admin 18.
- 로컬과 CI의 경계: SDD 구현자는 로컬에서 Docker·compose·실제 DB·Redis·SMTP·S3·생성 조합 실행을 하지 않는다. 로컬에서는 `pnpm check --fast`(통합 제외), DB 없는 단위 시험, DI·OpenAPI 생성, 루트 `pnpm check`, 프론트 check(차례로)만 돌린다. 통합·E2E·이미지·적합성·프론트 E2E·실제 생성은 CI가 확인한다. 개발 스택 `fastapi`·`joon`과 그 볼륨은 어떤 경우에도 쓰거나 내리지 않는다.
- 생성 시험의 HEAD 의존: 생성 CLI는 HEAD의 추적 파일을 읽는다. 템플릿·조합 자산을 바꾼 Task는 일반 커밋을 먼저 만든 뒤 그 커밋을 읽는 생성 시험을 돌린다. 생성 시험이 실패하면 고친 내용을 새 일반 커밋으로 쌓는다. 시험한 HEAD와 생성기가 읽은 HEAD가 어긋나는 "모든 검사 뒤 amend" 순환은 쓰지 않는다.

## 13. 위험과 미해결 항목

| 항목                                               | 상태                                                                          | 처리                                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OTel 계측 완전성                                   | 미해결(HTTP 1·Express 0·pg 6·ioredis 0)                                       | §7.11의 명시 span과 게이트를 `nestjs` CI 작업의 필수 단계로 둔다. 게이트를 통과하기 전에는 제품 수용이 아니다                                                                                                                                                                      |
| Darwin 프로세스 정리                               | 미해결(EPERM 174/175 두 번, 원인 미확정)                                      | §9.4의 소유·준비·유한 EPERM 처리와 결정적 단위 시험. 원래 실패를 성공으로 바꾸거나 일괄 재시도하지 않는다                                                                                                                                                                          |
| 준비 시간 경계                                     | 가짜 서버 fixture에서 5288·5306·5049ms가 3000ms 경계를 넘은 기록(R20·R21·R29) | 대기 중인 연결을 닫는 종료와 자식 종료 순서 처리를 제품 서버에 넣고, 기존 경계를 늘리지 않는다                                                                                                                                                                                     |
| R1 공유 잠금 재해석                                | 미해결 위험                                                                   | §10.4의 CI 수용 시험                                                                                                                                                                                                                                                               |
| R2 숨은 hoist 도달성                               | 미해결 위험                                                                   | §10.4의 hoist 그림자 감사와 프론트 전체 검사·E2E                                                                                                                                                                                                                                   |
| eslint-plugin-import 2.32.0의 선언 peer(ESLint ≤9) | 알려진 제한                                                                   | eslint-import-resolver-typescript 3.10.1의 선택 peer로 설치되며 규칙은 쓰지 않는다. 프론트 잠금에도 같은 버전으로 있다. peer 규칙 완화·가짜 peer 선언·프론트 버전 변경을 하지 않고 `docs/stack.md`에 적는다. `eslint.config.js`가 이 플러그인을 쓰지 않음을 하네스 시험이 확인한다 |
| tsx DI                                             | 지원하지 않음                                                                 | 앱 코드를 tsx로 실행하지 않는다. 도구 스크립트만 쓴다                                                                                                                                                                                                                              |
| Prisma 8                                           | RC(npm `latest`가 8.0.0-rc.22)                                                | §16 Q1. 고정하지 않은 Prisma 실행을 막는다                                                                                                                                                                                                                                         |
| 조합 API 이미지 크기                               | 프로토타입 1.109GB                                                            | §10.4의 필터 설치와 수용 시험                                                                                                                                                                                                                                                      |
| Windows 파일 모드                                  | Windows Node에서 `chmod` 뒤 stat이 0666                                       | 실행 권한 시험은 POSIX에서만 양성 단언을 한다                                                                                                                                                                                                                                      |
| 원본 오류 증거                                     | 보존                                                                          | 프로토타입의 실패한 CI·probe·캐시 기록은 실패로 남는다. 새 SDD 증거는 고유한 불변 라벨을 쓴다                                                                                                                                                                                      |

## 14. 프로토타입 판정 40개의 이월

프로토타입에서 코디네이터가 내린 기술 판정 40개(R1~R40)를 모두 이월한다. "최종 반영"은 이 설계가 제품에 가져오는 결론이고, "관측·비용"은 판정이 근거로 삼은 실제 결과다. 시간은 겹칠 수 있는 명령 벽시계 값이며 CPU·토큰·비용이 아니다.

| 판정 | 프로토타입 Task | 주제                                              | 최종 반영                                                                                 | 관측·비용                                                              |
| ---- | --------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| R1   | 1               | Nest 12.1.2 specificity와 선언 순서               | `shadow: 'warn'` + 의도 겹침 허용 목록 검사(§5.2), 두 순서 HTTP 시험                      | probe 0.2449s, 질문 대기 150.39s                                       |
| R2   | 1               | Oxc DI 미지원 가설이 실측과 어긋남                | tsc·SWC·Vitest-SWC 유지, Oxc는 검증됐지만 미채택, tsx 미지원                              | di-02 실패 3.1444s 뒤 di-03 3.3738s·di-04 2.8843s                      |
| R3   | 1               | 선택 전이 peer 불일치와 Node 하한                 | §13의 문서화, engines `>=24.15 <25`                                                       | `pnpm peers` 두 번 native 1(최종 0.060722s, 이전 거친 값 0.052013s)    |
| R4   | 2               | Zod int64 BigInt 내보내기와 계약 JSON number      | 자체 JSON number 정수 표현(§5.3)                                                          | 질문 73.945s, 행렬 0.04698s·0.05041s                                   |
| R5   | 3               | refresh 10개 경쟁의 패자 코드                     | 1×201·1×401 reused·8×401 token_invalid(§6.4)                                              | 질문 27.32s. 초기의 "9개 모두 reused" 가설은 버렸다                    |
| R6   | 3               | 깨끗한 설치에서 lint가 Prisma 생성보다 먼저       | check 순서 gen → lint(§8.2)                                                               | CI lint 340개 에러 native 1, 수정 뒤 생성 없는 RED 1/340 → GREEN 0/118 |
| R7   | 4               | 권한 fixture가 `assign([])`를 회수로 가정         | 부여는 추가만(§7.4)                                                                       | CI 통합 28/29(posts-read 403 기대·201), 수정 뒤 29 통과                |
| R8   | 5               | seed 그래프에 옮긴 실시간 발행기 공급자 누락      | 실제 SeedModule DI 컴파일 시험                                                            | CI setup 단계 실패로 통합 0/43, 수정 뒤 43                             |
| R9   | 5               | 비동기 BullMQ worker와 재발송 토큰 assertion 시점 | 실제 commit된 토큰 수를 유한 대기로 확인                                                  | CI 42/43, 수정 뒤 43/43                                                |
| R10  | 6               | 별도 publish worker native 1의 숨은 출력          | 실패 단계 표식과 비밀 값을 가린 8192자 tail                                               | 원래 CI 12+1 실패, 원인 미확정 상태로 진단만 추가                      |
| R11  | 6               | emitter가 Redis publish Promise를 버림            | worker 분기가 publish 완료·거부를 기다림(§7.9)                                            | 수명 주기 RED 5실패·3통과·unhandled 2 → GREEN 8/8                      |
| R12  | 6               | 적합성 selector 끝 `$`를 공유 shell guard가 거절  | 제품은 선택 실행을 두지 않는다(§10.2)                                                     | 0개 사례 실행, ENOENT가 native 2를 가림                                |
| R13  | 6               | 프론트 runStack guard가 백엔드 없이 비교          | `projectName(runId, app, backend)`(§10.3)                                                 | RED 20/4 → GREEN 24, Darwin EPERM 174/175 두 번                        |
| R14  | 7               | API 전용 optional 그래프 메타데이터               | 도달성 판정만 허용(§10.4 5)                                                               | 원본 도달 959/1062 일치                                                |
| R15  | 7               | 선택 시험용 흐름 사본                             | 제품에는 사본·선택 시험을 두지 않는다                                                     | 14개 inert `.test.ts.txt` 사본                                         |
| R16  | 7               | 잠금 도구 문서 직렬화                             | 앞 4,555바이트 보존(§10.4 6)                                                              | frozen 1/0.0727s → 수정 뒤 성공                                        |
| R17  | 7               | FastAPI 출력 캡처 fixture                         | 편집 전 골든과 바이트 비교(§10.4)                                                         | fixture가 추적하지 않을 파일을 추적해 1/4.198s                         |
| R18  | 7               | API 이미지 변환이 프론트 단계 선택보다 먼저       | 선택 뒤 변환(§10.4)                                                                       | 100 통과·3 실패 → 103 통과                                             |
| R19  | 7               | 파생 TypeScript override 메타데이터               | 지정자·해석 = 프론트 pin일 때만 허용(§10.4 4)                                             | 순수 검증기와 pnpm 12.6 직렬화 소스 근거                               |
| R20  | 7               | 준비 시간 실패 뒤 한 번의 정상 검사               | 경계는 늘리지 않는다(§13)                                                                 | 5288ms, 허용된 한 번도 5306ms로 실패                                   |
| R21  | 7               | 가짜 서버의 대기 연결                             | 종료 때 `closeAllConnections`(§9.4)                                                       | 통제 RED 5036.2ms → GREEN 27.8ms                                       |
| R22  | 7               | 새 시험의 타입 린트                               | 기대값을 바꾸지 않는 스타일 수정                                                          | lint 1/8.56s(4건)                                                      |
| R23  | 7               | CI 보조 모듈 타입 선언                            | 진실한 `.d.mts`                                                                           | TS7016 2/0.684s                                                        |
| R24  | 7               | 루트 lint가 Task 7 파일 7개에서 34건              | 범위 제한 수정                                                                            | Root 1/69.997s(10/11)                                                  |
| R25  | 7               | 통과한 Root 검사 뒤 스테이징 순서 예외            | 새 SDD는 스테이징 뒤 검사 순서를 지킨다                                                   | 전후 바이트 동일 독립 확인                                             |
| R26  | 7               | 커밋 hook 비밀 스캔 실패의 진단                   | 비밀 값을 출력하지 않는 메타데이터 진단                                                   | 12건/11 지문                                                           |
| R27  | 7               | 복사 흐름의 상수 참조 오탐                        | 제품에는 사본이 없어 해당 예외를 두지 않는다                                              | 5파일·3식별자 AND 예외 524바이트                                       |
| R28  | 7               | CI 사본 커밋 전 독립 설치·gen                     | 생성 CLI는 HEAD를 읽으므로 사본 단계가 없다. 잠금 파일 예외는 nestjs 경로로 넓힌다(§10.1) | 1/1.464s, 13건                                                         |
| R29  | 7               | 자식 종료가 부모 신호보다 먼저 오는 경쟁          | 두 순서 모두 처리하는 종료(§9.4)                                                          | RED 5037.6ms → GREEN 27.6ms                                            |
| R30  | 7               | 실제 하네스 입력 누락                             | 단독·조합의 실제 hook 설치와 거절 시험(§8.4)                                              | web 생성 ENOENT `apps/api/.claude/settings.json`                       |
| R31  | 7               | 해석 변화 후보 증거 없음                          | 진단 캡처는 제품에 두지 않는다. 잠금 정책은 실측 결과로 정했다                            | web `pnpm new` 1/7.06s                                                 |
| R32  | 7               | Zod 하나만 있다는 잘못된 단언                     | 원본 패키지 키 합집합 + 직접 4.6.5                                                        | 원본에 3.25.76과 4.6.5 공존                                            |
| R33  | 7               | `pnpm exec`에서 `npm_execpath` 없음               | 생성 CLI는 패키지 스크립트 수명 주기로 실행한다                                           | 진단 1/0.438s                                                          |
| R34  | 7               | 문서 포맷                                         | 문서도 check의 포맷 단계를 거친다                                                         | API check 1/3.279s                                                     |
| R35  | 7               | pnpm 12.6 교차 importer 재해석                    | 2단계 잠금(§10.4 1~3)                                                                     | 변화 119건: M1 47·M2 11·M3 39·M4 6·M5 16                               |
| R36  | 7               | 1단계에서 API가 없다는 진실한 관측                | 시험이 실제 부재를 기대한다                                                               | 전체 create 1/41.04s(198 통과·1 실패·7 건너뜀)                         |
| R37  | 7               | 2단계 API 병합 거절의 관측                        | 거절은 늘 치명적이다                                                                      | `@typescript-eslint/eslint-plugin` 레코드에서 거절                     |
| R38  | 7               | 준비 기록 경쟁과 web 비동기 assertion             | listen 뒤 준비 기록(§9.4), `waitFor`(§10.3)                                               | standalone `worker.json` ENOENT, web 929/930                           |
| R39  | 7               | 파생 TypeScript peer 정렬                         | 메모리 정렬만(§10.4 4)                                                                    | 공유 511 패키지·484 snapshot 중 API 5개 peer와 프론트 6개              |
| R40  | 7               | 조합 루트 공유 계약 경로                          | 루트 `contract/`(§10.4)                                                                   | 3d CI 순수 경로 오류 뒤 최종 CI 14/14                                  |

## 15. Root 운영 지침의 분류

아래는 판정이 아니라 코디네이터가 증거·보고 방식으로 준 지침이다. 제품 동작을 정하지 않으며, 구현 계획의 전역 제약(증거와 보고)으로 옮긴다.

- 실패한 원래 명령·CI·probe는 실패로 남긴다. native 0으로 잡힌 라이브러리 한계는 실패한 하위 프로세스로 바꾸지 않는다.
- 벽시계 합계는 겹칠 수 있고 CPU·토큰·비용이 아니다. 모르는 값은 null이다.
- 정리 주장은 기록한 소유 자원에만 한다. 이미지 태그 삭제를 층의 물리적 삭제로 부르지 않는다.
- 같은 HEAD의 변경 없는 재실행, hook 우회, 강제 push, amend 순환을 하지 않는다.
- 임시 폴더 사전 검사(실제 물리 경로, tsx IPC 경로 100바이트 미만, 자식에게만 `TMPDIR`), 명령 시각 기록, DONE ACK 전 자원 반납, 자기 FIFO 처리 증명.
- heartbeat 간격과 그 위반은 사실대로 기록한다.

## 16. 최종 사용자 질문

승인 검토에서 아래 셋만 묻는다. 실행 방식과 A3의 질문은 다시 묻지 않는다.

**Q1. Prisma 계열: 7.10.0으로 내고 8 이전을 별도 사이클로 할지, SDD 시작을 Prisma 8 GA까지 미룰지.**
2026-10-13 확인: npm `prisma`의 `latest`는 `8.0.0-rc.22`, `prev`는 `7.10.0`이다([npm dist-tags](https://registry.npmjs.org/-/package/prisma/dist-tags)). [공식 출시 상태](https://www.prisma.io/docs/orm/release-status)는 8을 release candidate로, GA를 2026년 10월 예정으로, 7을 8 GA 뒤 18개월 동안 버그·보안 수정으로 지원한다고 적는다. 같은 문서는 8에 아직 없는 기능으로 트랜잭션 격리 수준, `$extends`, 대부분의 중첩 쓰기, 원자적 `increment`, `P2002` 형식의 오류 코드를 든다. 이 설계는 posts 목록에 `RepeatableRead` 격리를, 가입 중복에 고유 위반 오류를 쓴다.
추천: 7.10.0으로 낸다. 실측한 런타임·이미지·통합 시험이 모두 7.10.0 기준이고 8은 필요한 기능이 빠진 RC다. 고정하지 않은 Prisma 실행을 hook으로 막아 8로 조용히 넘어가지 않게 한다. 8 GA 뒤 별도 이전 사이클을 둔다.

**Q2. PR마다 새 Docker 작업 다섯 개를 모두 돌릴지, 범위를 줄일지.**
다섯 작업: `nestjs`(템플릿 setup·통합 포함 check·프로세스 E2E·이미지·OTel 게이트), `conformance-nestjs`(94개), `nextjs-e2e-nestjs`(web 20개), `nextjs-admin-e2e-nestjs`(admin 18개), `create-combo-nestjs`(실제 조합 생성·E2E·이미지·R1·R2 수용 시험).
추천: 모두 돌린다. 기존 FastAPI 열과 같은 규칙이고, 각 작업이 다른 작업으로 대신할 수 없는 성질(템플릿 자체, 계약 동등성, 두 프론트의 실제 백엔드 연동, 생성 조합)을 증명한다.

**Q3. Node·Express 특성에서 오는 차이(§11)를 문서화된 차이로 받아들일지, 원본 JSON 숫자 표기까지 FastAPI와 같게 만드는 작업을 넣을지.**
관측한 한계: 정수 자리의 `10.0`·`1e3`을 정수로 받고, 2^53을 넘는 정수 표기는 가장 가까운 double로 읽고, `NaN`·`Infinity`는 400, 끝 슬래시는 404다. HEAD는 FastAPI와 같게 모든 경로에서 404로 맞춘다.
추천: 문서화된 차이로 받는다. 원본 표기를 보존하는 JSON 파서는 본문 읽기 계층을 갈아야 하고, JS 클라이언트는 이런 표기를 보내지 않으며, 계약 적합성 94개와 무관하다. 계약 실패를 이 목록으로 덮지 않는다.

## 17. 참고

- 계약: [openapi.yaml](../../../contract/openapi.yaml), [적합성 흐름](../../../contract/conformance/test/flows/), [목 서버 지침](../../../contract/mock/AGENTS.md)
- FastAPI: [템플릿 지침](../../../templates/fastapi/AGENTS.md), [.env.example](../../../templates/fastapi/.env.example)
- 루트: [생성 CLI combo.ts](../../../create/src/combo.ts), [lockfile.ts](../../../create/src/lockfile.ts), [workspace.ts](../../../create/src/workspace.ts), [CI](../../../.github/workflows/ci.yml), [공유 process-tree](../../../shared/nextjs/scripts/process-tree.mjs)
- 프로토타입(변경 불가 링크): [evidence.md](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/docs/evidence.md), [파이프라인](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/src/core/jsonapi/pipeline.ts), [operation 선언](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/src/core/jsonapi/operation.ts), [요청 검증](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/src/core/jsonapi/validation.ts), [UnitOfWork](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/src/core/db/unit-of-work.ts), [잠금](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/src/core/db/locks.ts), [비밀번호](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/src/core/security/passwords.ts), [JWT](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/src/core/security/jwt.ts), [presign](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/src/core/storage/presign.ts), [실시간 emitter](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/src/core/realtime/emitter.ts), [OTel 등록](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/src/core/telemetry/register.ts), [e2e:serve](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/scripts/e2e-serve.ts), [Dockerfile](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/prototypes/nestjs/Dockerfile), [잠금 병합](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/create/src/lockfile.ts), [그래프 도달성](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/create/src/lock-graph.ts), [조합 Dockerfile](https://github.com/builder-shin/ai-template/blob/7727356cbd7b9432042f604be7e53f06f1d9974b/create/assets/combo/apps/api/Dockerfile.nestjs)
