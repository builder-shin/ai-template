# NestJS prototype evidence

## Task 1 — toolchain, DI metadata and boundaries

Observed on 2026-10-12 KST (2026-10-11 UTC), macOS arm64, Node **24.19.0**, pnpm
**12.6.0**. This is prototype evidence for a draft branch that must not merge as product.
Final NestJS design/plan approval remains separate. No Docker or real infrastructure ran locally.
Task 1's exact-head CI was verified by the coordinator before Task 2 dispatch: all ten
baseline jobs plus nestjs-prototype succeeded. Task 2's CI remains pending exact-head validation.

### Versions and installation

`minimumReleaseAge: 1440` applies to the independent project. Registry publication metadata
confirmed every direct pin was older than 24 hours. No alternate major or newer patch was
substituted. Frontend files and versions were unchanged.

| Packages                                                                                    | Resolved versions                         |
| ------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `@nestjs/common`, `core`, `platform-express`, `platform-socket.io`, `websockets`, `testing` | 12.1.2                                    |
| `@nestjs/cli`                                                                               | 12.0.8                                    |
| TypeScript / typescript-eslint / ESLint / boundaries / Prettier                             | 6.0.3 / 8.71.0 / 10.11.0 / 7.2.0 / 3.9.9  |
| reflect-metadata / rxjs / Zod                                                               | 0.2.2 / 7.8.2 / 4.6.5                     |
| SWC core / unplugin-swc / Vitest / tsx / supertest                                          | 1.16.12 / 2.0.0 / 5.0.1 / 4.23.15 / 7.3.1 |
| Socket.IO / Express                                                                         | 4.8.3 / 5.2.1                             |

Omitted direct dependencies were resolved against registry and installed peer metadata:

| Direct dependency                   | Pin     | Reason                                                                                                  |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `@swc/cli`                          | 0.8.1   | Satisfies Nest CLI's `^0.8.0` and SWC core peer; published 2026-04-01                                   |
| `vite`                              | 8.3.1   | Matches frontend lock resolution and the Vitest peer range below; published 2026-09-24                  |
| `express`                           | 5.2.1   | Exactly the installed Nest Express dependency; needed to set strict routing before adapter construction |
| `@types/express`                    | 5.0.6   | Express 5 types; published 2025-12-01                                                                   |
| `@types/supertest`                  | 7.2.1   | Supertest 7 types; published 2026-07-14                                                                 |
| `@types/node`                       | 24.13.6 | Matches frontend direct pin                                                                             |
| `@eslint/js`                        | 10.0.1  | Matches root pin and supports ESLint 10                                                                 |
| `eslint-import-resolver-typescript` | 3.10.1  | Matches frontend lock resolution, including `.js` → `.ts` resolution                                    |

The actual Vitest Vite peer range is `^6.4 || ^7 || ^8`.

`pnpm --dir prototypes/nestjs exec nest info` reported all six Nest packages at 12.1.2.
`pnpm --dir prototypes/nestjs why socket.io typescript zod @swc/core` found exactly one
version of each: **4.8.3, 6.0.3, 4.6.5, 1.16.12**. Nest's peer cycles are expected framework
relationships, rather than multiple resolutions. `@nestjs/cli@12.0.8` itself declares
`>=20.11`, while the installed `@angular-devkit/schematics-cli@22.2.0` requires
`^22.22.3 || ^24.15.0 || >=26`; therefore the project's declared
Node range is **`>=24.15 <25`**. Build and test execution was measured on 24.19.0; the
24.15.0 binary itself was not separately exercised.

The first install exited **1** with the ignored-build list:
`@swc/core@1.16.12, esbuild@0.28.2, unrs-resolver@1.12.2`.
The project's `allowBuilds` enables only these three packages for SWC native verification,
the tsx/esbuild probe and the TypeScript import resolver. These keys agree with the
frontend workspace. Frozen installation then exited **0**. No global package configuration
was changed. The optional resolver peer `eslint-plugin-import@2.32.0` advertises ESLint
through 9, so both initial and final `pnpm peers check` runs **FAILED, exit 1** against
the approved ESLint 10 pin. The untouched frontend lock already resolves the same optional
plugin 2.32.0 and resolver 3.10.1 under ESLint 10.11.0. Its rules are not enabled; real resolver
and boundaries executions pass. No peer exception was added. The final design must decide
how to resolve this unused transitive declared-peer limitation.

### Executed commands

Durations below are previously observed Task 1 parent runs, rather than the final gate
receipt durations. The final private report and raw journals retain final gate timings.
Child stdout/stderr, UTC start/end
and actual native exits are retained privately; reproducible DI and check child receipts
are also written to ignored `.cache/di` and `.cache/check` directories after each child exits.

| Command from repository root                                          | Exit | Seconds | Observation                                               |
| --------------------------------------------------------------------- | ---- | ------- | --------------------------------------------------------- |
| `pnpm --dir prototypes/nestjs install --frozen-lockfile`              | 0    | 0.075   | Final frozen installation                                 |
| `pnpm --dir prototypes/nestjs exec nest info`                         | 0    | 0.690   | Nest package versions above                               |
| `pnpm --dir prototypes/nestjs why socket.io typescript zod @swc/core` | 0    | 0.065   | One resolution of each                                    |
| `pnpm --dir prototypes/nestjs run -s check`                           | 0    | 5.689   | Five stages; 51 tests in five files                       |
| `pnpm --dir prototypes/nestjs build`                                  | 0    | 0.373   | Nine application files compiled with SWC                  |
| `pnpm --dir prototypes/nestjs probe:di`                               | 0    | 2.884   | All five transformation paths executed                    |
| `pnpm check`                                                          | 0    | 74.207  | `check 통과: 11단계`, including workflow/actionlint check |

The preflight resolved physical OS tmp and measured the conservative
`tsx-<uid>/2147483647.pipe` path at **80 UTF-8 bytes**, below 100. `TMPDIR` is passed only
to children. Probe scripts preflight each tsx-bearing child; the root check was preflighted
with the same rule. The repository's existing check stages and all ten CI jobs were
preserved; the workflow's original bytes remain an exact prefix before the additive job.

### DI and type imports

The same provider graph is built with **`nest build -b tsc`**, **`nest build -b swc`**,
**Vitest + unplugin-swc**, **Vitest default Oxc**, and **tsx/esbuild**. Each path executes
`Test.createTestingModule().compile()` and verifies actual injected identities and behavior:
cross-file classes, public-index module exports, explicit tokens, controller, guard, pipe,
interceptor, gateway, and a two-file `forwardRef` + `WrapperType<T>` cycle.

| Path               | Valid graph metadata    | Compile / dependency verification              | Invalid type import                            |
| ------------------ | ----------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Nest CLI tsc       | Baseline                | Pass / pass                                    | Rejected; erased token is `Function`           |
| Nest CLI SWC       | Exactly equal to tsc    | Pass / pass                                    | Rejected; erased token is `Object`             |
| Vitest SWC         | Exactly equal to tsc    | Pass / pass                                    | Rejected; erased token is `Object`             |
| Vitest default Oxc | Exactly equal to tsc    | Pass / pass                                    | Rejected; erased token is `Object`             |
| tsx/esbuild        | No constructor metadata | Compile returns, dependency verification fails | Missing dependency caught by runtime assertion |

The brief expected Oxc to lack metadata. That hypothesis was overturned by the installed
**Vite 8.3.1** execution. Per-process plugin receipts prove default has `vite:oxc` and no
`swc`, while unplugin-swc disables Oxc and has `swc`. Each transform ran in a separate
process with its own plugin configuration. The required selected tsc/SWC/Vitest-SWC paths
match. SWC build + Vitest-SWC remains the selected path to keep build and test transforms
aligned; this probe supports considering Oxc in the later design, without adopting it now.

Metadata equality is asserted for the **valid graph**. The deliberately invalid type-import
provider is recorded separately, including its different erased token and rejection, rather
than falsely claiming those invalid metadata values are equal. tsx exits 0 because the probe
captures the failed graph verification as evidence; that is not a claim that tsx supports DI.

`verbatimModuleSyntax: true` is enabled. Type-import lint autofix preserves decorated
constructor class value imports, and the real tsc build compiles them without TS1272.
A TypeScript 6 compiler-program negative fixture observes **TS1272** for an interface value
import with verbatim syntax disabled, **TS1484** with it enabled, and no diagnostics after
`import type`. Runtime DI separately proves why injectable classes must remain value imports.

Initial failed DI runs are retained: SWC's nested fixture output path needed correction;
then the exploratory assertion that Oxc must fail was corrected after its actual successful
graph. No required positive graph assertion was removed.

### Boundaries and suppression

ESLint API tests prove **22 negative fixtures are rejected** with the expected rule IDs
and actionable `대신` messages, while **18 positive fixtures pass**. Cases cover cross-module
private imports, direct module assembly imports, reversed controller/service/repository
dependencies, core → modules, generated Prisma imports outside repository/core/db,
dependencies outside the module DAG, both unsafe SQL methods, and suppression comments.

Positive cases cover every allowed inter-module DAG edge, controller/service/repository,
schemas, policies/events, core helpers, tagged SQL, repository and core/db Prisma access,
and explained suppressions. The generated-client files in these fixtures are static lint
stubs; no Prisma client or database was generated or exercised in Task 1.

Comment scanning uses the frontend harness's **TypeScript parser, actual comment ranges
and same-line reason** convention. It rejects strings or later comments masquerading as a
reason, bare `any`, `@ts-ignore`, `@ts-nocheck`, unexplained `@ts-expect-error`, and bare or
self-disabling ESLint suppressions. An ESLint postprocessor retains this separate scan even
when an inline directive tries to disable the reason rule. It does not alter source text.

Source/utility maximum was **140 lines**, test maximum **111 lines**, below 400/600.
typescript-eslint 8.71.0 parsed TS 6.0.3 without unsupported-version warnings. Boundaries
7.2.0 reports a descriptor `mode` deprecation warning; its installed file-mode API was
actually exercised successfully. Migrating descriptor syntax can be considered in final design.

### Route policy finding

Installed Nest **12.1.2** exposes the policy object
`{ duplicate: 'error', shadow: 'error' }` and strategy `'specificity'`.
The initial real-app probe showed a pinned-version limitation: parameter-first
`/sessions/:id` then `/sessions/current` initializes under `shadow:error`; reversing the
declarations throws `Conflicting HTTP routes detected`. The installed conflict detector
filters shadows only when sorting promotes a later-declared winner.

The provisional prototype workaround was approved: use **specificity, duplicate:error,
shadow:warn** for the intentional current/id overlap. Real initialized-app HTTP tests
verify identical correct responses for `current`, `ordinary-id`, `124`, and `currentish`
in **both declaration orders**. Separate fixtures reject exact duplicates and ambiguous
`/:id` versus `/:name` shadows with strict policies. The order-sensitive strict-policy
behavior remains asserted as a regression probe.

**Runtime shadow:warn does not enforce a blanket no-shadow guarantee.** The final design
must choose how unexpected overlaps will be detected. No Nest dependency was patched.
Strict routing must be set on Express **before ExpressAdapter construction**, because its
constructor installs middleware and creates the router; setting it only afterward did not
reject trailing slashes. The corrected health and route HTTP tests verify trailing-slash 404s.

### Bounded oxlint comparison

Oxlint **1.87.0** was installed only in an owned temporary experiment project, outside this
worktree, with a 1440-minute release age. One bounded comparison used the same then-existing
**38 fixtures**: the type-aware invocation exited **1** in **0.319 s**, before linting,
because no `oxlint-tsgolint` executable was installed. Oxlint declares the optional
companion peer `oxlint-tsgolint >=7.0.2003`; it was not installed. TypeScript 6 semantic
parity was **not demonstrated** by this failed type-aware invocation.

A JS-only diagnostic invocation, after isolating that missing prerequisite, exited **1**
in **0.500 s** with the **20 expected negative diagnostics** and **18 positive passes**.
Boundaries and prototype JS plugins loaded and worked; none of those 38 cases was missed.
The two additional assembly/index → Prisma fixtures were added afterward and are covered
by ESLint; the bounded oxlint experiment was not broadened or repeated for them.
Decision: **retain ESLint; do not adopt oxlint or add it as a project dependency**.

### Remaining scope

CI did not run locally; the coordinator subsequently verified Task 1's exact head for all
eleven required jobs. Task 2 is now documented separately in
[the Task 2 measurements](task-2.md). Task 3 now adds the data layer and authentication core; see [Task 3 measurements](task-3.md).
Actual infrastructure acceptance and Tasks 4–7, conformance, images, frontend E2E and generated combinations remain outstanding.
The BFF shared-IP fairness limitation, timing/socket notes and web
warning baseline 17/admin 0 remain deferred and unchanged.

## Task 3 — clean generated-client check correction

The first Task 3 CI run failed the prototype check with 340 lint errors: frozen installation
did not create the ignored Prisma client, and `check` ran typed lint before generation.
Earlier local checks had an existing generated client. The narrow correction moves the
existing Prisma stage ahead of lint: format → Prisma generation/OpenAPI comparison → lint
→ types → size → tests → OpenAPI comparison. All seven checks and their exit handling remain.

With only the ignored `src/generated/prisma/` moved to a verified owned OS-temp backup,
the original command exited 1 at lint in 4.191 seconds and left that directory absent.
The same command after the ordering correction started with the directory still absent,
generated 15 files/513741 bytes plus the manifest, and passed all seven checks and 118 tests
in 10.115 seconds. Every regenerated file matches the backup; the temporary backup is removed
only after that verification. Detailed CI observations and remaining acceptance are recorded
in [Task 3 measurements](task-3.md). The original failed CI gate remains unaccepted; the
corrective commit still requires a fresh exact-head result for all twelve jobs before Task 4.

## Task 4 — golden posts, files and storage

The coordinator verified the corrected Task3 exact head with all twelve jobs successful in
[run38181560071](https://github.com/builder-shin/ai-template/actions/runs/38181560071) before this phase.
The original failed run and the six warnings in each historical auth run remain separate evidence.

The current local implementation mounts seventeen operations, retains83 schemas with zero structural
differences and passes seven check stages/124 tests. AWS3.1149.0 no-network signatures contain
content-length;content-type;host, use SigV4 and omit optional checksum query fields; the default
comparison retains content-length;host plus CRC32 fields. Actual Nest/Supertest10/20-way loopback
requests preserve startup listener counts/max10 and close explicitly without observed warnings.
These are local signature/lifecycle observations. The first real integration execution in
[run38184340281](https://github.com/builder-shin/ai-template/actions/runs/38184340281) at commit7ced12
exited1 after14.30 seconds:28/29 passed. Its permission fixture used additive assign([]), leaving
the member role and posts:create intact; POST returned201 where403 was required. Unicode100000/
100001 assertions were not reached and remain unproved in real CI.

That failed run separately proved auth13/refresh1+1+8, Seaweed signed4/transmitted5-byte rejection
with403 SignatureDoesNotMatch/no object, constant4 SELECTs/5 statements at page sizes1/20, an actual
service repeatable-read snapshot (reader196/writer205, externally committed2/stable1), quota20
(ten201/ten422,1024 bytes/11 pending rows), and two preserving storage:setup executions. Seven
fresh suite lifecycles explicitly closed with warnings[]/maxListeners10 and zero raw MaxListeners
warnings. The historical six warnings in each Task3 run remain unchanged.

The test-only correction removes this user's role rows in the real transaction, checks persisted
absence and /me roles/permissions, asserts403 permission.denied, restores member, then checks the
persisted role and /me posts:create before requiring201 at the original Unicode100000 boundary.
The100001422 code/pointer/max and seed assertions, all29 case declarations, auth13 and quota20 remain.
Runtime additive role semantics, guard/auth/domain, schema/migrations, versions and workflow are
unchanged. Local checks do not prove real permission or Unicode acceptance; fresh corrected exact-head
all twelve CI jobs remain pending before the next prototype phase. See [Task4 evidence](task-4.md).

## Task5 local implementation and pending real CI

The corrected Task4 predecessor at dee9bb08241dc6bc2e0fd656178013c97976c122 passed all twelve
required jobs in [run38185336644](https://github.com/builder-shin/ai-template/actions/runs/38185336644),
including all29 real integration cases. Earlier original failed-run observations remain historical.
Task5 now implements Redis jobs/mail, the pinned Nest gateway, adapter/emitter/control delivery,
rate limits and typed readiness, completing nineteen mounted operations with83 schemas.
The original local tests passed131 cases; generation, SWC and repository comparison passed.
The first actual18-row gateway probe exited0 in0.959460s and observed zero payload as undefined,
arrays preserved and no nil-return ACK within100ms. Production always returns RealtimeAck and
preserves permission-free unsubscribe, distinct from the transport dummy's symmetric403.
The initial optional-native build installation failure remains exit1; msgpackr-extract is explicitly
disabled and frozen installation passes. The earlier unused peer mismatch still exits1.
Fourteen new CI-only cases retain all original29/auth13/quota20. No local real infrastructure
acceptance is claimed. See [Task5 evidence](task-5.md) for decisions, observed scope and exact-head
CI requirements; Tasks6–7 and full final design approval remain later.

## Task5 CI seed-provider correction

The first Task5 integration job failed during setup in
[run38188140211](https://github.com/builder-shin/ai-template/actions/runs/38188140211/job/114614865223)
at commit53d46658. Migration deployment to app/app_test/app_e2e succeeded, Prisma generated
17 files/693199 bytes and SWC compiled131 files, but setup's `node dist/seed.js` child returned1.
The integration step was skipped: **0 of43 declared cases executed**. CI used Node24.21.0;
local measurements used Mac Node24.19.0. Neither this setup failure nor the earlier local
success establishes BullMQ6/ioredis6 compatibility.

Task5 moved RealtimePublisher from PostsModule into the global RedisModule. AppModule imported
RedisModule, but the narrower SeedModule still omitted it, leaving PostEvents' dependency
unresolved. The correction imports RedisModule into SeedModule and exports the actual SeedModule
for a regression in `test/seed-graph.test.ts`. That test compiles the production module with inert
DB/storage/Redis overrides and closes it; it does not initialize the module, execute seed, issue
queries or connect to infrastructure. The complete corrected local check passes132 tests in17 files. With only the export added, it failed at missing
RealtimePublisher (exit1,0.585752s). Adding RedisModule passed the same test (exit0,0.631470s).

All43 integration declarations and original29/auth13/quota20 are preserved. Corrected Task4's
successful29-case observations and the historical six Task3 listener warnings remain separate.
Production API/jobs/transport/settings, schema/migrations, versions and workflow are unchanged.
A **new exact corrected-head all-twelve-job CI result is pending**, including real seed and43
integration cases; the original failed run remains evidence. See [Task5 details](task-5.md).

## Task5 asynchronous resend fixture correction

The seed-corrected head072274d6 ran all43 cases in
[run38189421106](https://github.com/builder-shin/ai-template/actions/runs/38189421106/job/114618758109).
Setup, drift and build succeeded; integration returned exit1 with42 passed and1 failed across
ten suites, Vitest-reported114.95s. This follows the original53d46658 setup failure with0/43
executed. All fourteen new jobs/realtime/rate-limit cases passed on072274d6, but that result
does not accept its failed integration job or whole workflow.

The unchanged resend case asserted two committed tokens immediately after HTTP202 and observed
one at auth.test.ts77. Previously the in-process after-commit broker awaited the mail handler;
BullMQ now awaits queue.add, with token creation committed later by the separate worker.
These are source-trace findings, consistent with the observed early assertion. FastAPI and
contract resend tests already await mailbox completion; they were inspected statically only.

The fixture now uses the existing waitFor to await actual accountToken count2, then retains
the original explicit count2 assertion and every202/201 response. Its existing10-second deadline
and20ms condition polling are unchanged; query errors propagate and timeout fails the case.
Only the wait/import and portable evidence change. All43 case declarations, auth13 assertions
and twenty-way quota remain; production auth/jobs/mail/UoW, seed, dependencies and CI are unchanged.
The failed real CI is the regression RED; corrected real CI GREEN remains pending.
No local DB, worker, broker, mail or mirrored-helper execution is claimed.

The072274d6 log records ten suite lifecycles with warnings[], explicitlyClosed:true and
maxListeners10. Historical Task3 six warnings in each auth run remain separate, unchanged evidence;
no suppression or listener-limit change was added. Critical failure lines and source snapshots
were read; no complete raw-log manual review or provider-transcript review is claimed.
A new changed-head43-case pass and complete twelve-job success remain required before Task6;
Tasks6–7 and full product design/plan approval remain future work.

The corrected fixture passes the local seven-stage check with the unchanged132 tests/17 files,
repository four-stage check/23 tests/schema83 difference0, SWC131, selected DI, lazy compiled
app19 initialization/close and root eleven-stage check. Actual command times are in
[Task5 local correction gates](task-5.md#asynchronous-fixture-correction-local-pure-gates).
No real corrected integration result is claimed from these pure checks.

## Task 6 — 이미지·실행기·대상 격리

Node 24.19.0/pnpm 12.6.0의 실제 전달 probe에서 --가 남고 INIT_CWD가 호출 폴더였다. 도구는 tsx, 서버는 빌드한 dist에서 실행한다. 물리 tmp의 보수적 IPC 경로는 80 UTF-8 바이트였고 100 미만을 매번 확인했다. TMPDIR는 자식에게만 적용했다.

로컬 가짜 프로세스 검사는 셸 없는 인자·호출 폴더·환경 덮어쓰기, 엄격한 Origin, 서버 조기 종료, 로그 끝부분, 실제 SIGINT/SIGTERM의 130/143과 명령·세 서버·자손/그룹 정리를 검증했다. 기본 60초 한도는 가짜 시계로 검사했고 짧은 실제 deadline도 별도로 확인했다. 원본 shared process-tree의 Darwin EPERM polling을 바이트 그대로 복사했다. 이 결과는 실제 DB/Redis/SMTP/S3 수용 증거가 아니다.

실행기는 app_e2e와 Redis DB14를 강제한다. Compose 환경 덮어쓰기를 서버 준비 경로에서 제거하고 환경 파일 자동 읽기를 끈다. PostgreSQL 소유 확인은 그 자식 환경을 명시하며 기존 호출의 기본 동작은 유지한다. NestJS 적합성은 프로젝트 nestjs를 명시한다. 초기화는 관리 DB 검사 뒤 migrate·TRUNCATE·seed와 DB14 FLUSHDB만 하고 버킷 CORS Origin 합집합을 적용한다. DBapp/Redis0 표식 보존, E2E 표식 제거,18000 폐쇄와 실제 자식 종료는 CI로 남겼다.

이미지는 Node24.19 bookworm-slim/pnpm12.6 frozen 설치·Prisma generate·SWC·운영 의존성·UID10001이며 HEALTHCHECK가 없다. Prisma7.10 CLI를 운영 의존성에 남겨 이미지 하나의 migrate를 지원한다. 전체 이미지와 Prisma 패키지 크기는 CI에서 기록하고, 패키지 자체 크기를 전이 의존성까지 포함한 CLI-free 이미지 비교로 부르지 않는다. 실제 크기에 따른 최종 제품 결정은 후속 전체 계획에 남긴다.

web/admin NestJS 프로젝트·이미지 접두사와 compose 두 개를 더했다. 기본 FastAPI 계획을 이전 추적 소스와 실제 Node에서 대조해 두 앱의 기존 모든 계획 필드와 실행 명령이 동일함을 확인했다. 포트·인자·정리 기본값과 기존 두 FastAPI compose 파일은 유지한다. smoke는 준비·시드둘·Mailpit·web OAuth·worker 메일 Origin·스토리지 PUT preflight이며 프론트 E2E20/18 전체 수용이 아니다.

변경하지 않은 적합성94는 일반 선언89와 OAuth parameterized5를 포함한다. 선택기의 승인된 정확한41 이름을 로컬 정적으로 대조했다. CI는 동일한94 사례를 이름으로 선택해 실제41pass/53skip/0fail을 검사하고 JSON 원장에 기록한다. 아직 실제 계약 응답41을 실행한 결과가 아니다. 남은53은 최종 SDD 범위다.

기존43 통합 사례(인증13·quota20·원래 boundedwait 포함)의14 소스 파일과 기존12 CI 작업17344바이트는 그대로다. storageSetup 함수 몸체는 바이트 동일하게 core로 옮겨 빌드한 storage-init과 기존 도구가 같이 쓴다. API의 HOST 선택은 E2E의127.0.0.1 바인딩만 추가하며 기본 listen 경로는 유지한다.

SDK Node/HTTP0.223.0, trace-base2.12.0, Express/ioredis0.71.0, pg0.75.0을 정확 고정했다. 최초 protobufjs build-policy 실패와 자동 placeholder 중복 오류를 보존했고, 설치한 warning-only postinstall 검토 뒤 allowBuilds=false로 명시해 frozen 설치가 통과했다. minimumReleaseAge1440/기존 정책과 프론트·공유·계약 버전은 유지했다. 새 peer 억제는 없다. peers check는 기존 eslint-plugin-import2.32/ESLint10의 optional 선언 불일치로 계속 native1이며 통과로 부르지 않는다.

OTel은 기본 꺼짐이다. CI가 실제 --import 등록 API의 HTTP/Express/pg/ioredis span 수와 health 전후 차이를 기록한다. 누락 또는 초기화 실패는 이 prototype Task에서 nonblocking이지만 complete=false로 보존한다. ESM loader와 명시적 span 대안은 실제 결과와 고정 패키지 소스로 최종 계획이 결정한다. 로컬 build/typecheck는 runtime span 증거가 아니다.

실제 로컬 명령 결과(명령이 반환된 뒤 측정한 wall seconds; CPU·모델 토큰·청구 금액이 아니다):

| 명령/관측                                                                  | native exit | wall seconds |
| -------------------------------------------------------------------------- | ----------- | ------------ |
| pnpm12.6 forwarding/INIT_CWD probe                                         | 0           | 0.169998667  |
| pnpm install --frozen-lockfile                                             | 0           | 0.280831583  |
| pnpm --filter @ai-template/scripts check                                   | 0           | 8.883615625  |
| pnpm check:repo                                                            | 0           | 2.037287542  |
| pnpm build                                                                 | 0           | 0.384602959  |
| pnpm probe:di                                                              | 0           | 2.672773208  |
| Node built ESM app init/19 mounted operations/close (infrastructure=false) | 0           | 0.333824791  |
| Node+tsx 이전 FastAPI 계획 대조                                            | 0           | 0.108039375  |
| pnpm check                                                                 | 0           | 68.022358125 |
| pnpm check                                                                 | 0           | 14.535361416 |
| pnpm peers check                                                           | 1           | 0.061765791  |

자체 check는7단계/167단위20파일, root scripts는307사례27파일과 타입 검사를 통과했다. repo check는4단계/23사례/83schemas diff0, SWC는134파일, 선택 tsc/SWC/Vitest-SWC DI와 built ESM19/close를 확인했다. 루트 check11과 일반 hook을 커밋 전에 요구한다.

실패 원본도 보존한다. 최초 runner table의 배열 행 분해 오류, OAuth typed provider/parameterized count를 놓친 정적 audit 오류, 새 파일 포맷·타입 린트 오류, 새 대상 도움말 기대 변경, 기존12jobs prefix audit의 여분 개행 오류는 각각 구체적으로 고친 뒤 검사했다. prefix 바이트 불변은 올바른 startsWith 비교로 확인했다. 원래13auth/43 통합 assertions나41 대상 이름을 빼서 성공시킨 것이 아니다.

새 nestjs-prototype-stack을 더했다. 실제 이미지/UID/migrate, process E2E, app/Redis0 보존, app_e2e/Redis14 clearing, 실제41 적합성, web/admin smoke와 OTel 관측은 새 exact-head ALL13 PR CI가 확인하기 전까지 pending이다. 이후 Task7, 완성한 전체39operations/126schemas/94cases/web20/admin18/four creation variants/harness15 계획, 새 제품 승인도 남아 있다.

### 최초 Task6 CI 실패와 진단 전용 후속 변경

위 문단은 최초 로컬 완료 당시의 pending 기록이다. 원래 `dd798660`의 [CI 38194991406](https://github.com/builder-shin/ai-template/actions/runs/38194991406)은 최종 12성공·stack 1실패였다. `flows.ts:84`는 발행 worker의 native1에 대해 명시한 0을 기대했다. 기존 caller가 child tail을 전달하지 않아 해당 worker stderr와 실제 원인은 미확정이다. API 가입·메일·인증·로그인·발행까지의 진행은 순차 소스/실패 위치 추론이며 최종 processFlows 산출물은 없다.

실제 이미지 713,078,917바이트/UID10001/Node24.19.0/Prisma7.10.0과 Prisma 패키지 자체 42,052,481바이트를 기록했다. 패키지 값은 전이 의존성을 제외한다. 실제 app·Redis0 표식 보존과 app_e2e·Redis14 clearing, 소유한 최상위 4개 그룹 종료·18000 폐쇄는 통과했다. 실제 통합43/43·10개 수명 주기의 명시적 close/maxListeners10/새 경고0도 별도 성공 증거다. 과거 실패·Task3 경고를 지우지 않으며 마지막 suite의 5개 프로세스 기록을 전체 누적 종료 증거로 해석하지 않는다.

후속 변경은 diagnostic-only다. fixture의 고정 bootstrap/register/update/close 실패 단계와 caller의 비밀값을 가린 기존 bounded tail만 추가하고 성공 출력의 식별자를 제거한다. 실행에 준 같은 child 환경과 inherited command 양쪽의 값을 가려 app_e2e/DB14로 바뀐 URL도 보호한다. 종료 코드0, published 상태, commit, Socket.IO의 별도 프로세스 전달과 23바이트 업로드/내려받기 assertion은 유지한다. 실제 runtime/provider/settings/의존성·workflow·43 통합·167 단위 사례는 바꾸지 않는다. 원본 CI RED는 성공으로 바꾸거나 같은 HEAD로 재실행하지 않는다.

현재 소스의 SWC134 빌드 후 실제 compiled AppModule의 inert compile/register/close와 기존 fixture의 실제 PostsService/Repository/UnitOfWork/PostEvents/Emitter·제어된 transaction/Redis 포트 실행이 각각 native0이었다. 이는 실제 worker 기동·DB commit·Redis/Socket.IO의 GREEN이 아니며 원인은 미확정이다. 새로운 exact-head ALL13과 실제 발행·업로드/다운로드, 원래 도달하지 못한 OTel/app profile/41 적합성/web/admin smoke가 남아 있다. Task7과 최종 전체 제품 계획·새 승인은 계속 게이트 뒤에 둔다.

진단 변경의 실제 로컬 결과(반환 후 monotonic wall seconds; 실제 인프라 수용과 구분):

| 검사                                                                | native exit | wall seconds |
| ------------------------------------------------------------------- | ----------- | ------------ |
| frozen 설치                                                         | 0           | 0.108093083  |
| 최종 자체 check 7단계/167사례/20파일                                | 0           | 20.719106708 |
| 자체 repo check 4단계/23사례/83schemas diff0                        | 0           | 2.189888000  |
| SWC134                                                              | 0           | 0.367210500  |
| 선택 DI                                                             | 0           | 2.628160542  |
| 인프라 없는 compiled ESM19/init/close                               | 0           | 0.345309167  |
| 실제 caller assertion/가짜 child/서로 다른 child·inherited URL 가림 | 0           | 0.163119792  |
| 검토 보완 후 루트 check11                                           | 0           | 72.150209334 |

단계 probe의 조용한 종료/예외 8개와 잘못된 published 상태 1개는 실제 native1로 보존됐고 각각 올바른 실패 단계를 냈다. 성공 대역은 native0·빈 stderr였다. caller 대역도 child1을 여전히 assertion 실패로, child0을 성공으로 처리했고 8192자 tail·비밀값 가림을 검사했다. 이것은 원래 CI child stderr를 복원한 결과가 아니다. 일반 hook과 별도 커밋 이후의 새로운 실제 CI 판정은 계속 남아 있다.

### 실제 Redis 게시 완료의 후속 수정

위 진단 전용 기록 이후 `4c22a78e`의 [CI 38198199629](https://github.com/builder-shin/ai-template/actions/runs/38198199629)도 최종 12성공·stack 1실패로 끝났다. 이번 child tail은 `committed:true` 뒤 close 단계와 ioredis의 `Connection is closed` 오류를 보여 주었고 caller는 native1에 대해 기존 기대0으로 실패했다. 이 출력은 별도 프로세스 이벤트 전달의 성공이 아니다. 이번 이미지는 713,078,918바이트로 최초 dd 이미지의 713,078,917바이트와 구분한다. UID10001/Node24.19.0/Prisma7.10.0과 패키지 자체 42,052,481바이트도 기록됐으며 패키지 값에는 전이 의존성이 빠진다. 이번 실제 통합43/43과 10개 수명 주기의 명시적 close·새 listener 경고0은 별도 성공 증거다. processFlows·23바이트 업로드·OTel/app profile/41 적합성/web/admin smoke는 여전히 수용되지 않았다.

설치한 redis-emitter5.1.0은 실제 Redis `publish(channel, packet)`을 호출하지만 그 Promise를 버리고 literal true를 반환한다. UnitOfWork는 이미 commit 뒤 훅을 await하고 실패를 포함한다. RuntimeRealtimePublisher의 worker 분기가 실제 게시 완료를 기다리지 않아 요청 반환과 즉시 app.close가 lazy Redis 명령보다 앞설 수 있었다. 설치한 ioredis6.0.0의 nonready disconnect와 manual-close flushQueue는 대기 명령을 reject한다. 이 소스와 실제 CI trace가 연결 종료 경쟁을 뒷받침하며, 로컬에서 실제 Redis를 실행한 결과라고 주장하지 않는다.

production 수정 전에 실제 RuntimeRealtimePublisher·설치한 emitter·UnitOfWork를 제어된 지연 publish 포트로 검사했다. native1/0.696351791초로 8개 중5개가 실패했고 처리되지 않은 게시 rejection2개를 Vitest가 그대로 검출했다. commit 뒤에도 훅이 게시 완료까지 대기해야 한다는 검사가 조기 반환으로 실패했고, rejection은 훅 caller와 기존 UnitOfWork 오류 기록으로 전달되지 않았다. 실제 encoded packet/namespace/key/단일 룸·중복 제거 union 검사는 그 실패보다 먼저 통과했다. 실패 원본은 그대로 보존한다.

worker 분기만 installed emitter의 publish 포트에서 실제 Redis Promise의 완료·거부를 관찰하고 기다리도록 고쳤다. 기존 server emit·adapter ping과 observer·payload 생성·빈 룸 처리는 그대로다. 새 DB 없는 수명 주기8개는 packet/룸 union, 게시 전 commit·완료까지 대기, 직접 rejection 전파, commit 결과 보존·기존 실패 containment·후속 훅 실행, 겹친 게시의 독립 완료, 빈 룸, 비동기 payload, server 분기를 검사한다. 타이머나 sleep 없이 event-loop turn만 비워 settlement를 검사하며 unhandled-rejection 검출을 끄지 않는다. 최종 targeted GREEN은 native0/0.586459000초였다. 새 테스트의 ES2023 타입 선언과 미사용 인자에 걸린 scoped lint native1도 보존하고 테스트 대역의 타입만 고쳤으며 설정·의존성은 바꾸지 않았다.

이 GREEN은 제어된 포트의 완료 계약이다. Redis PUBLISH 응답을 기다린다는 것과 실제 Socket.IO client가 별도 프로세스의 이벤트를 받는다는 것을 구분한다. 기존 publish.mjs·flows.ts 진단, 즉시 app.close, 모든 종료·이벤트·23바이트 업로드 assertion과 기존167 단위·43 통합·41 선택·workflow 바이트는 유지한다. 새 변경 HEAD의 WHOLE13과 실제 게시·업로드·OTel/app profile/41·두 smoke 검증이 남아 있으며 Task7은 그 뒤에만 진행한다. 최종39operations/126schemas/14flows94cases/web20admin18/four creation variants/15jobs 전체 계획과 새 사용자 제품 승인은 별개다.

수정 후 실제 로컬 gate 결과(반환 후 monotonic wall seconds; 실제 인프라 수용과 구분):

| 검사                                          | native exit | wall seconds |
| --------------------------------------------- | ----------- | ------------ |
| frozen 설치                                   | 0           | 0.183453458  |
| targeted lifecycle RED:5실패/3통과/2unhandled | 1           | 0.696351791  |
| 최종 targeted lifecycle GREEN:8통과           | 0           | 0.586459000  |
| 최종 자체 check7/기존167+새8=175/21파일       | 0           | 24.017651833 |
| repo check4/23/83schemas diff0                | 0           | 2.325820292  |
| SWC134                                        | 0           | 0.435939959  |
| 선택 DI                                       | 0           | 3.013311708  |
| 인프라 없는 compiled ESM19/init/close         | 0           | 0.361279250  |
| 루트 check11                                  | 0           | 80.679905292 |

선택 tsc/SWC/Vitest-SWC의 DI metadata/graph 일치와 잘못된 type import 거절을 확인했다. 탐색 Oxc도 동작했으며 tsx graph verified=false는 기존 한계로 유지한다. 최종 코드의 자체·repo·build·DI·ESM·루트 gate는 순차로 한 번씩 실행했고, 이후에는 반환된 시간 표만 보충했다. 일반 포맷·린트·비밀 hook과 별도 커밋을 요구하며 새 실제 CI 수용은 여전히 남아 있다.
