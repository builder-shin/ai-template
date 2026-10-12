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

### 적합성 인자와 reporter 실패 처리의 후속 수정

위 게시 완료 수정 후 `cffb2f52`의 [CI 38200517499](https://github.com/builder-shin/ai-template/actions/runs/38200517499)는 최종 12성공·stack 1실패였다. 이번 실제 통합43/43과 processFlows native0, API·별도 worker의 이벤트 전달, 업로드·내려받기23바이트는 통과했다. 개발 app/Redis0 표식 보존, app_e2e/Redis14 표식 제거와18000 포트·소유 최상위 프로세스 그룹4개의 종료도 확인됐다. 이 네 그룹을 모든 중첩 자식의 누적 PID 증거로 부르지 않는다. app profile의 migrate/storage-init은 종료0, API는 ready, worker·scheduler는 실행 중이었다.

이번 cff 이미지는713,079,962바이트, UID10001/Node24.19.0/Prisma7.10.0이었다. 최초 dd713,078,917바이트·진단4c713,078,918바이트 기록은 유지한다. Prisma 패키지 자체42,052,481바이트는 전이 의존성을 제외하며 CLI 없는 전체 이미지 비교가 아니다. 실제 ESM OTel은 HTTP1/Express0/pg6/ioredis0/healthDelta0/complete=false였다. probe native0이 완전한 계측을 뜻하지 않으며 이 불완전성은 프로토타입의 비차단 관찰과 최종 제품 계획의 미결 과제로 남긴다.

적합성 실패는 API assertion 실패가 아니다. 공유 shellCommand가 CASE_PATTERN 끝의 달러 문자를 실행 전에 거절해 child가 native2로 끝났고, wrapper가 존재하지 않는 JSON을 읽어 ENOENT/native1로 원래 종료를 가렸다. 실행한 사례는0개이며41통과·53건너뜀을 수용하지 않는다. web·admin smoke도 둘 다 skipped였다. 이전 pending 스냅샷은 위 완료 결과와 실제 정리 기록으로 보충한다.

수정 전에 기존 selector와 실제 변경하지 않은 공유 guard를 새 repository differential 검사로 실행해 native1/0.390252250초,4개 중2실패로 재현했다. CASE_NAMES 바이트는 그대로 두고 끝의 달러를 어떤 문자도 뒤따를 수 없는 `(?![\s\S])`로 바꿨다. 실제 공유 guard의 모든 forwarded 인자 검사와 순수 Node argv child의 shell 왕복이 통과했고, 변경하지 않은94개 선언을 실제 suite prefix·Unicode·구두점과 함께 분류해41선택/53비선택을 확인했다. 접미 글자·구두점·줄바꿈을 붙인 제목과 공유 guard의 위험 문자 거절도 검사한다. 이 분류는 실제 인프라 적합성 실행 결과가 아니다.

prototype wrapper는 호출 전에 이전 reporter JSON과 count 산출물을 지운다. 새 결과가 없거나 읽을 수 없으면 명시적으로 실패를 기록하고 child 비정상 종료를 유지하며, child0이어도 결과가 없으면1로 실패한다. 새 정상 형식의 실패 보고서와 실제 count는 그대로 남긴다. 기존94total/41passed/53pending/0failed·이름 동일성 success assertion도 그대로다. 새 differential13개는 소유한 Node fake command와 실제 wrapper를 실행하는 Node driver로 native2/누락·stale/child0·누락/새 실패 보고서/잘못된 count와 이름을 검사했다. synthetic 보고서는 이 대역 테스트에만 쓰며 실제 count 증거로 쓰지 않는다. native GREEN0/1.147340959초와 기존 selection unit0/0.320991708초였다. 임시 child/보고서 폴더는 각각 finally에서 제거했다.

기존175 단위·43 통합·41개 제목·94 선언, 공유 guard와 실행기·workflow·runtime·의존성·계약 바이트는 유지한다. 변경 HEAD의 새 WHOLE13과 실제41/53·web/admin smoke 수용은 코디네이터의 후속 CI에 남는다. Task7과 최종39operations/126schemas/14flows94cases/web20admin18/four creation variants/15jobs 전체 계획·새 사용자 제품 승인은 별도 게이트다.

이번 수정의 반환 후 실제 로컬 gate 비용(벽시계 시간이며 CPU·토큰·과금이 아니다):

| 검사                                           | native exit | wall seconds |
| ---------------------------------------------- | ----------- | ------------ |
| frozen 설치                                    | 0           | 0.084816792  |
| 실제 guard RED/2실패                           | 1           | 0.390252250  |
| 새 differential GREEN13                        | 0           | 1.147340959  |
| 기존 정확41 선택 unit                          | 0           | 0.320991708  |
| 자체 check7/175단위21파일                      | 0           | 18.960812959 |
| repo check4/기존23+새13/83schemas diff0        | 0           | 2.125486667  |
| SWC134                                         | 0           | 0.383134167  |
| 선택 DI                                        | 0           | 2.577326875  |
| compiled lazy ESM19/init/close/listening=false | 0           | 0.360268083  |
| 루트 check11                                   | 0           | 73.890196125 |

모든 최종 gate를 순차로 한 번씩 실행했고 이후에는 이 반환된 시간 표만 보충했다. 선택 tsc/SWC/Vitest-SWC metadata와 graph 검사는 통과했고 탐색 Oxc도 동작했다. tsx graph verified=false는 기존 제한으로 유지한다. 일반 format/lint/secrets hook과 새 일반 커밋 뒤의 실제 WHOLE13은 여전히 별도 수용 단계다.

### frontend stack의 backend namespace guard 후속 수정

`77e392e4`의 [실제 CI 38202891381](https://github.com/builder-shin/ai-template/actions/runs/38202891381)는 최종12성공·stack1실패였다. 실제 적합성은 native0/41pass·53skip·0fail·94total이며 기존 count와 전체41개 이름 동일성 assertion을 통과했다. 실제 통합43/43과10개 수명 주기의 명시적 close·maxListeners10·새 listener 경고0, processFlows native0/API·별도 worker 이벤트/업로드·내려받기23바이트도 통과했다. 과거 Task3의6개 경고와 dd/4c/cff 실패·보고 기록은 유지한다. 프로세스 증거는 최상위4개 그룹의 종료이며, 통합 process 파일은 마지막 rate suite의5개 child 종료·연결0만 기록한다. 이를 전체 누적 중첩 PID 증거로 확대하지 않는다.

이번 이미지는713,079,978바이트/UID10001/Node24.19.0/Prisma7.10.0이었다. Prisma 패키지 자체42,052,481바이트에는 전이 의존성이 빠진다. app profile의 migrate/storage-init0/API ready/worker·scheduler 실행과 개발 app/Redis0 표식 보존·app_e2e/Redis14 표식 제거·18000 포트 종료도 확인했다. 실제 OTel은 HTTP1/Express0/pg6/ioredis0/healthDelta0/complete=false이며 완전한 계측이 아니다. 프로토타입의 비차단 관찰로 유지하되 최종 제품 계획에서 loader hook 실측 또는 명시적 span으로 해결해야 한다.

web smoke step16은 올바른 NestJS 프로젝트를 출력한 다음 시작 전에 거절됐고 admin smoke는 skipped였다. createPlan과 validateCompose는 backend를 전달했지만 runStack의 사전 namespace guard는 projectName의 기본 FastAPI를 사용했다. production 변경은 이 호출에 plan.backend를 전달하는 한 곳뿐이다. 프로젝트·이미지·포트·환경·기존 자원 거절·신호·실패 진단·정리·--down·기본 FastAPI 동작은 그대로다.

기존 NestJS regression16개를 그대로 보존하고 web/admin × fastapi/nestjs의 정상4개와 교차 namespace 거절4개를 추가했다. 실제 runStack에 소유한 inert Dependencies를 주고 정상 실행의 validate/probe/config/containers/volumes/up/ready/worker/command/down/image/removeImage 순서와 정확한 namespace·backend 인자·capture·signal을 확인한다. FastAPI 정상 사례는 backend 인자를 생략해 기존 기본값을 검사한다. 교차 namespace는 code1과 유용한 오류를 내고 validate/probe/execute/ready/command·cleanup을 전혀 호출하지 않아야 한다. Docker·네트워크·실제 backend는 실행하지 않았다.

수정 전 새24개를 실제로 실행한 RED는 native1/20통과·4실패였다. 정상 NestJS web/admin의 code0 기대가 code1로 실패했고, 교차 NestJS web/admin는 사전 guard를 지나 validate가 호출돼 실패했다. 단일 호출 수정 뒤 같은 테스트 바이트로 GREEN native0/24통과였다. 기존 stack/admin/process/smoke115개도 변경 없이 native0으로 통과했다. 이 대역 lifecycle 검증은 실제 Docker·BFF smoke 수용을 대신하지 않는다. 새 변경 HEAD의 WHOLE13 전체 성공과 web/admin 실제 smoke, Task7과 최종39operations/126schemas/14flows94cases/web20admin18/four creation variants/15jobs 계획·새 사용자 제품 승인은 여전히 별도 게이트다.

수정 전후 실제 로컬 명령 비용(반환 후 monotonic wall seconds; CPU·토큰·과금이 아님):

| 명령                                                          | native exit | wall seconds |
| ------------------------------------------------------------- | ----------- | ------------ |
| `pnpm install --frozen-lockfile` (prototype)                  | 0           | 0.133348458  |
| `pnpm --dir scripts test test/web-e2e/nestjs.test.ts` (RED24) | 1           | 0.463187542  |
| 같은 명령 (GREEN24)                                           | 0           | 0.367553375  |
| 기존 stack/admin/process/smoke regression115                  | 0           | 0.831615791  |

최종 자체 check7/175단위21파일·repo check4/36·83schemas diff0·SWC134·선택 DI·compiled lazy ESM19/init/close·루트 check11과 일반 format/lint/secrets hook은 이번 새 커밋의 완료 기준이다. tsx graph verified=false는 기존 한계로 유지한다. 아래 목록은 위 실제 CI reporter가 통과로 기록한 전체41개 이름이며, 새 로컬 대역 결과와 구분한다.

- /api/v1 아래의 없는 경로는 404 에러 문서다
- 1 MiB(1,048,576바이트)를 넘는 본문은 413 jsonapi.content_too_large이다
- JSON:API가 아닌 Content-Type으로 본문을 보내면 415다
- JSON이 아니거나 구조가 틀린 문서는 400이다
- fields[type]을 주면 그 타입의 리소스에 요청한 필드만 담는다
- posts는 발행된 글의 이벤트만, posts:all은 초안의 이벤트까지 받는다
- refresh token은 한 번만 쓴다. 쓴 것을 다시 쓰면 그 세션을 통째로 폐기한다
- roles:read가 없으면 권한 목록을 보지 못한다
- 가입하면 인증 메일이 오고, 인증을 마쳐야 로그인할 수 있다
- 남의 파일은 보지도 고치지도 못하고, 소유자가 지우면 사라진다
- 등록된 권한을 코드 순으로 보고, 역순으로도 정렬한다
- 로그아웃한 세션의 연결은 서버가 끊고, 같은 사용자의 다른 세션 연결은 남는다
- 만들면 pending이고, meta.upload에 스토리지로 보낼 PUT 요청이 있다
- 매개변수가 붙은 JSON:API 미디어 타입만 받는 Accept는 406이다
- 목록은 발행된 글만 보이고, 작성자 필터가 나면 내 초안도 보인다
- 발행을 취소하면 posts는 post.unpublished(식별자)를, posts:all은 post.updated를 받는다
- 발행하거나 발행을 취소하면 공개 목록의 첫 페이지에 바로 드러난다
- 본문은 100,000자까지이고, 넘으면 422 validation.too_long이다
- 비밀번호에 짝 없는 서로게이트가 있어도 계정이 있든 없든 틀린 비밀번호와 같은 401이다
- 새 글은 작성자만 보는 초안이고, 발행하면 누구나 보며, 발행을 취소하면 다시 숨는다
- 생성 요청의 type이 엔드포인트와 다르면 409, 클라이언트가 만든 id가 있으면 403이다
- 선언과 크기가 다른 본문은 스토리지가 받지 않고, 완료를 알리면 file.upload_incomplete다
- 없는 계정으로 재발송을 요청해도 202다(계정이 있는지 드러내지 않는다)
- 에러 문서는 status, code, title과 meta.traceId를 담는다
- 올리고 완료를 알리면 ready가 되고 downloadUrl로 내려받는다
- 이미 쓰는 이메일로는 가입하지 못한다
- 익명 연결은 posts만 구독한다. 모르는 채널은 validation.invalid_choice다
- 인증 메일을 다시 받으면 새 토큰으로 인증하고, 같이 발급된 토큰은 더 쓰지 못한다
- 작성자와 커버 이미지를 포함하고, 볼 수 있는 글의 커버는 누구나 읽는다
- 정수 자리에 숫자 문자열이나 불리언을 보내면 422 validation.invalid_format이다
- 제목과 본문으로 찾고, 제목으로 정렬하고, 페이지로 나눈다
- 컬렉션은 페이지 메타와 요청 경로 기준의 상대 페이지 링크를 담는다
- 틀린 비밀번호로는 로그인하지 못한다
- 틀린 토큰으로는 인증하지 못한다
- 티켓은 로그인해야 받고, 한 번만 쓴다
- 판별 유니온(grant)의 필드 오류는 grant 종류와 이름이 같은 필드가 있어도 본문의 위치를 가리킨다
- 페이로드가 없거나 둘 이상인 subscribe·unsubscribe는 틀린 페이로드라 validation.invalid_choice다
- 허용하지 않는 타입과 한도를 넘는 크기는 만들지 않는다
- 허용하지 않은 Origin의 연결은 거부하고, 허용한 Origin의 연결은 받는다
- 헬스체크가 계약대로 응답한다
- 현재 세션에서 로그아웃하면 그 access token은 더 쓰지 못한다

### 변경하지 않은 로컬 프로세스 정리의 관찰

이번 로컬 자체 check의 변경하지 않은 fake-process suite는 두 번174/175로 실패했다. 첫 SIGTERM 정리는 native1/18.931579417초, 다음 정상 전체 검사의 SIGINT 정리는 native1/17.797633250초로 process-tree의 kill EPERM을 기록했다. 변경하지 않은 SIGTERM 한 사례만 재검사한 결과는 native0/0.510094250초/1pass·8skip이며 전체175 통과를 대신하지 않는다. 두 실패의 raw·cache와 소유한 fixture JSON을 보존했고 각각 기록된6개 PID·3개 그룹의 ESRCH를 확인한 뒤 그 임시 폴더만 지웠다. 실패 artifact에는 command PID가 없으므로 이것을 모든 자식의 누적 종료 증거로 부르지 않는다. Darwin reaping은 후보이며 원인을 확정하거나 실패를 면제하지 않는다. process helper·테스트·assertion·기본값을 바꾸지 않았고 serial override·경고 억제·timeout 변경을 하지 않았다. 이 로컬 Darwin 정리 신뢰성은 최종 제품 계획에 미결 사항으로 전달한다. 다음 정상 전체 검사는 소유 자원 확인 뒤 허용된 한 번만 실행하며 다시 실패하면 반복·커밋 없이 실패로 보고한다.

### 허용한 한 번의 정상 전체 검사 결과

소유 자원 확인 후 허용된 정상 전체 check 한 번은 native0/175pass·21files·7단계를 통과했다. 이후 repo check4/36·83schemas diff0, SWC134, 선택 tsc/SWC/Vitest-SWC DI, compiled lazy ESM19/init/close/listening=false, 루트 check11을 순차로 통과했다. 앞선 두174/175 실패와 targeted1pass·8skip은 삭제하거나 성공으로 바꾸지 않는다. 최종 통과는 Darwin 정리 신뢰성 해결을 증명하지 않는다. 이후 변경은 이 반환된 결과·시간 보충뿐이며 guard와 테스트 바이트는 그대로다.

실제 반환 후 벽시계 시간이며 CPU·토큰·과금이 아니다.

| 검사                                           | native exit | wall seconds |
| ---------------------------------------------- | ----------- | ------------ |
| 자체 check7/175/21                             | 0           | 18.441832125 |
| repo check4/36/83diff0                         | 0           | 2.091473792  |
| SWC134                                         | 0           | 0.374565750  |
| 선택 DI                                        | 0           | 2.569021667  |
| compiled lazy ESM19/init/close/listening=false | 0           | 0.329721333  |
| 루트 check11                                   | 0           | 69.308306125 |

## NestJS 생성 프로브

`--template nestjs`와 `--api nestjs`의 web·admin·두 프론트 경로를 추가했다.
API의 직접 pin과 importer, 기존 package/integrity를 유지하면서 다섯 부모의 하위 해석을 기존 프론트와 정렬했다.
추가한 37 package·38 snapshot과 두 optional 표식 외의 원본 lock 의미는 보존한다.
API만 그래프 도달성에 따라 전역 optional 표식을 비교하며 패키지·간선·peer·문서 metadata는 엄격하다.
minimumReleaseAge 1440, 프론트 정책 동등성과 TypeScript 6.0.3 override를 유지하고 API allowBuilds는 충돌 없는 합집합으로 만든다.

원본 도구 문서 표식을 잃은 첫 frozen 설치 실패를 보존했다.
원본 4,555바이트 prefix 복원 뒤 한 번의 변경 frozen 설치는 native 0이었다.
네 변형의 실제 생성·설치·setup·API check·build·e2e:serve·이미지는 새 CI에서 별도로 측정한다.
로컬 inert 생성과 원본 잠금 그래프 검사는 실제 인프라 성공을 대신하지 않는다.

기존 선택 테스트의 경로 세 개만 바꾸고 14개 계약 흐름을 바이트 동일한 plain-text fixture로 보관했다.
전체 파일 집합·바이트와 생성된 단독·조합 API 내부 경로를 검사한다.
175개 기존 단위 선언·assertion, 43개 통합 선언, auth 13개, quota 20개 요청과 선택 41/제외 53 이름은 보존한다.
FastAPI의 세 조합은 변경 전 전체 파일 바이트·실행 권한과 비교한다.

API 19 operation·83 schema와 원본 39 operation·126 schema의 차이를 실제 CI frontend gen 출력과 함께 기록한다.
전체 frontend check·브라우저 E2E 20/18 및 전체 conformance 94 성공은 아직 주장하지 않는다.
기존 13개 workflow job을 바이트 그대로 두고 네 변형을 맡는 한 job만 추가했다.
자세한 범위와 남은 제품 결정은 [생성 프로브 기록](task-7.md)에 있다.

API 해석 검증은 호출자가 원본 pin을 명시한 TypeScript 6.0.3의 파생 override 추가만 허용한다.
기존 override·다른 metadata·peer snapshot은 계속 엄격히 보존한다.
선택 검사의 pinned 포맷 실패와 기존 준비 제한 사례의 174/175 실패를 원시 출력 그대로 보존했다.
실패한 검사에서 생성물 검증 단계의 이전 캐시는 새 성공 증거가 아니다.

통제한 빈 TCP peer를 둔 가짜 fixture 종료의 새 사례 한 개는 원본 RED 5,036.205ms/native 1에서
정확한 close→closeAllConnections 수정 뒤 같은 테스트 GREEN 27.768ms/native 0이었다.
175개 기존 assertion·제한값·실제 프로세스 helper를 보존하며 새 전체 검사 대상은 176개다.
앞선 준비 실패의 peer 상태는 미측정이고 제품 종료·EPERM 신뢰성은 후속 계획에서 해결해야 한다.

## Task 7 CI clone materialization correction

The original generation probe stopped at the clone-only ordinary commit before any generated variant started. Its root workspace frozen installation succeeded, but the newly copied independent `templates/nestjs` workspace had no installation: ESLint 10.11 could not resolve `eslint-plugin-boundaries` from its boundary configuration. The normal secret hook also reported twelve already reviewed bare constant references in copied conformance fixtures and one `@inquirer/password` package-key line in the copied lock file. Always-cleanup reported no remaining folders, an empty variant list and closed ports. The original workflow subsequently completed with thirteen successful jobs and the generation probe failed; this is preserved failure evidence.

Preparation now copies the same tracked files with their Git modes, writes the same template definition, runs measured `pnpm install --frozen-lockfile` and `pnpm run gen` inside the copied workspace, verifies every copied tracked SHA and filesystem mode, then stages and makes the same ordinary commit. A failure in installation, generation or preservation prevents staging and commit. The root format, lint and secret hooks remain enabled. All four variant runtime gates, resolution checks, resource ownership, cleanup, image and frontend-difference measurements retain their original code.

The scanner configuration preserves its complete 2,712-byte prefix and appends the exact two AND allowlists: `generic-password` with the five anchored copied conformance paths and the three anchored identifiers `PASSWORD`, `NEW_PASSWORD`, `LONE_SURROGATE`; and `generic-password` with the exact copied lock path and its package-key line. Other rules and existing policies are preserved.

| Local check                         |  Native exit | Wall seconds | Observed scope                                                                                                                                         |
| ----------------------------------- | -----------: | -----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Materialization RED                 |            1 |  0.910321959 | Four behavioral cases fail because ordinary commit occurs before copied-workspace bootstrap                                                            |
| Same-test GREEN                     |            0 |  0.906307750 | Four cases pass: preparation order, actual tracked byte/mode copying and ordinary Git commit, installation/generation failures, changed-byte rejection |
| Index-only scanner boundary control | 1 (expected) |  0.546942250 | All eight controls pass; scanner child 0.282450542 seconds, eleven intended positive findings                                                          |

The scanner ignores all three symbols on all five allowed paths and the package key only at the exact copied lock path. A different literal and bare identifier, all three symbols on an unlisted fixture and another path, another rule on an allowed path, a different password-looking lock line and the same package key on another lock remain detected. Only rule/file/line/fingerprint metadata is retained; candidate fields are discarded. The owned scanner fixture is removed and its recorded process has exited. Tests use owned Git/files and inert install/gen commands; they do not prove a real copied workspace installation or generated service acceptance.

Normal create, prototype, repository/schema, SWC, DI, compiled lazy ESM, staged root check and ordinary hooks are required for local completion. Real copied installation/gen, all four generated variants and complete changed-head fourteen-job CI remain pending. This remains the partial 19-operation/83-schema probe with the existing 41-pass/53-skip selection of 94 cases; full 39/126/94 and web 20/admin 18 coverage, incomplete telemetry and cross-platform process reliability remain future product gates.

### Local verification failure and POSIX mode scope

The first ordinary prototype check for this correction exited 1 in 19.140801500 seconds: 175 passed and one failed out of the preserved 176 tests in 22 files. The existing controlled pending-peer cleanup case observed 5,049.293ms against its unchanged 3,000ms bound and fixture exit 1. The protected fake fixture, process code, assertions and deadlines are unchanged. All eight fresh owned cleanup observations confirm recorded processes/groups gone and temporary folders absent; the recorded peer port was rebound. The failed cache is retained, and its old generated-stage record is stale because the test stage stopped first. Actual termination ordering and the broader process reliability cause remain unresolved.

The full create check passed with 188 tests, seven existing skips, 195 total in 21 files and 66 Node tests. The initial four-case GREEN remains the original test-byte measurement. A subsequent measured Windows Node 24.19 filesystem probe reports mode 0666 after either chmod 0755 or 0644. Only the new positive executable-mode case now skips Windows; its complete assertions and all four Mac/Linux cases are retained. Executable-mode proof is POSIX and Ubuntu CI scope; this does not establish Windows generated-project acceptance. Installation/generation failure and changed-byte rejection cases remain portable inert controls. New checks for this narrowly changed test are recorded separately, while all prior successful and failed results remain preserved.

### Controlled close-order correction

A separate controlled experiment observed the fake grandchild's close event before requesting parent shutdown, while the parent and an incomplete owned TCP peer remained alive. The prior fake shutdown handler registered its close listener only after SIGTERM and therefore missed that already completed event. The measured private pair reproduced 5,047.168875ms / exit 1 and 27.953833ms / exit 0. The original failed whole-check run did not record this event order, so that run's exact timing cause remains unproven.

A new POSIX regression reads the actual fixture at execution time, inserts exactly one passive close-marker observer into an owned temporary copy, closes the owned grandchild first and observes its marker before calling the unchanged production cleanup helper. The fake fixture now registers close handling early and remembers both child completion and shutdown request, preserving its other bytes and behavior. The original 176 tests, all deadlines and production process helpers are unchanged.

The new test's native RED exited 1 in 5.561657875 seconds with measured 5,037.622959ms and fixture exit 1. After the exact fake shutdown-block change, the same test bytes passed native 0 in 0.457737584 seconds with measured 27.618125ms and fixture exit 0. Both runs prove the chosen event order, peer closure, two owned PIDs and group gone, owned port rebound and temporary folder absence. A separate Python rebind reader failed with address-in-use; the actual test and a fresh Node net.Server reader prove rebinding, and the Python-specific cause remains unmeasured. No test replay was used to repair that reader.

The local unit suite now comprises the preserved 176 cases plus one close-order case: 177 cases in 23 files. Final seven-stage, repository/schema, SWC, DI, compiled lazy graph, staged root and ordinary hook gates remain required; their actual outputs are retained in the correction report. The accepted changed create check remains 188 passed with seven existing skips / 195 total and Node 66. This proves fake-source cleanup only; production process reliability, all four real generated variants and new complete changed-head fourteen-job CI remain separate gates. Full product coverage and telemetry limitations remain as previously recorded.

## Task 7 real tracked harness inputs correction

The exact `f55f2259f16a9b1d12ba0a6bbdf76b563963e42d` workflow `38237468681` completed with thirteen successful jobs and one generation failure. Clone preparation independently installed and generated the copied workspace, and its ordinary commit `013` passed the existing format, lint and secret hooks. Standalone generation, frozen installation, setup, seven-stage 177-case check, SWC build, actual API child readiness, image build, clean Git and owned compose/image cleanup completed. Web generation `035` then failed with native 1 in 0.640899746 seconds, at 10:40:15.186Z–10:40:15.826Z, because `apps/api/.claude/settings.json` was missing. Cleanup at 10:40:17.859Z recorded standalone completed/cleaned, web incomplete/cleaned with no owned infrastructure or image, folders absent and ports closed. Admin and both never started. These are preserved failed-CI results, without an independent fresh check of all 35 historical command PIDs.

The real 366 tracked prototype files had none of `.claude/settings.json`, `lefthook.yml` or `.betterleaks.toml`. Production `writeHarness` requires all three API inputs. The older `nestjsFixture` copied a FastAPI fixture that fabricated empty settings and hook jobs, masking the actual missing NestJS inputs. Production CLI requirements, existing fixtures, 195 create cases, 177 prototype cases, all manifests/locks/goldens and the fourteen-job workflow remain unchanged.

The three new tracked inputs use existing prototype Node/pnpm tools. Settings allow the existing source checks, build, tests, generation, DI and scoped formatter/linter commands, explicitly deny private environment reads and generated/OpenAPI edits, and retain dangerous-command denies. The Lefthook input has staged Prettier and ESLint jobs and pre-push `pnpm check`. Betterleaks contains only `extend.useDefault = true`, without allowlists, prefilters or rule disabling. The existing 3,390-byte repository scanner configuration remains byte-identical.

The new parameterized `create/test/nestjs-probe-harness.test.ts` materializes actual tracked prototype inputs, selected real frontend inputs and tracked combo assets into owned Git/file fixtures. It calls the real `createProject` and combo `writeHarness` paths for standalone, web, admin and both. Only pnpm installation/format/generation calls are inert; no generated installation, setup, check, runtime or infrastructure runs locally. The test verifies required API input bytes and tracking, functional format/lint definitions, merged API/frontend jobs and the existing frontend-backed secret job, default scanner protection without API exceptions, moved environment/generated-source denies, ordinary fixture first commits and clean Git. It uses the existing Windows copy behavior and no new test skip; Windows runtime acceptance remains unmeasured.

| Local gate | Native exit | Wall seconds | Observed scope                                                                         |
| ---------- | ----------: | -----------: | -------------------------------------------------------------------------------------- |
| RED        |           1 | 17.253618750 | Four real missing-input failures; three combo failures originate in writeHarness       |
| GREEN      |           0 | 26.620075167 | Same 8,107-byte test, four variants pass after only the three tracked inputs are added |
| create     |           0 | 42.730691417 | 192 passed plus seven existing skips, 199 total / 22 files; all 66 Node cases pass     |
| prototype  |           0 | 16.857593166 | All seven normal stages and unchanged 177 cases / 23 files                             |
| repo       |           0 |  2.218515333 | Four stages, 36 cases / three files, 83 schemas with zero differences                  |
| SWC        |           0 |  0.371007667 | 134 compiled files                                                                     |
| DI         |           0 |  2.679976500 | tsc, SWC and Vitest SWC verify the graph and reject invalid type imports               |
| lazy       |           0 |  0.367011000 | Compiled ESM init/close, 19 operations, listening=false and infrastructure=false       |

RED and GREEN used identical test bytes, SHA256 `a15b4b50b94f8a5d0b113db05841f69976413b909b659464633914b667ff1f66`. Their twelve owned folders each were removed and their emitted owner PIDs were checked absent. Full create cleanup verified 299 recorded folders and emitted fixture owners; unrecorded inner Git/Node-test PIDs remain unknown. Source checks preserve the fresh nine fake-process observations, emitted PIDs, two explicit groups, mock/lazy process closure and four numeric port rebindings. The initial new-test lint diagnostic found an empty inert callback and a possibly undefined frontend expression; both were corrected before RED, without changing old tests. The first read-only follow-up proof reader incorrectly assumed mode 0444 for a coordinator file whose actual mode is 0644; the actual mode and failed reader were preserved. Native walls are command measurements, not CPU, model-token or currency estimates.

The DI exploratory tsx graph remains verified=false with erased metadata; it is not an accepted app runtime. Existing negative-test error/warning logs and older process/telemetry failures remain preserved. The final complete six-path staging precedes one root eleven-stage gate and one ordinary normal-hook commit; their actual outcomes belong to the correction report.

These files supply partial prototype generation inputs, not full standalone security or agent-harness acceptance. Standalone Lefthook/secret-tool installation and invocation have not been implemented or measured here. The default scanner input adds no exception for the copied source references; the full product must separately design and validate standalone secret tooling and narrowly justified source-reference handling. Migration-aware, tool-edit, stop and session agent hooks are absent from this prototype input and remain full-product planning gates. Combo hooks and frontend-backed scanner wiring are configuration evidence, not measured generated-runtime security acceptance. No tool download, dependency/pin change, scanner exemption or CLI fallback was added. All four real changed-head generated variants, their runtime/images/cleanup and a new exact whole fourteen-job CI remain pending. Full 39-operation/126-schema/94-flow and web 20/admin 18 coverage, complete telemetry, process reliability and a new concrete full-plan approval remain separate product gates.

## R31·R32: 정상 CLI 이후 잠금 관측과 원본 Zod 집합 보존

시작 HEAD `ef9fca4fb98bba0e840218b51a21f83575ac76d8`의 CI `38241941310`은 14개 작업 중 13개 성공, 생성 프로브 1개 실패로 끝났다. 정상 web 생성은 `11:22:10.671Z`–`11:22:17.732Z`, native 1, 7.060851838초였으며 실제 lockfile-only 해석 뒤 web 루트 importer 보존을 거절했다. standalone은 완료·정리했고 admin·both는 시작하지 않았다. 거절된 after 잠금 파일은 남지 않아 실제 변경 필드는 여전히 **UNKNOWN**이다. 다섯 peer 문맥 차이는 원본 비교의 가설이며 실제 실패 원인으로 확정하지 않는다.

R31은 정상 `pnpm new`의 모든 인자·환경·순서와 fatal 결과를 유지한다. 실제 조합 importer 거절 뒤에만 별도 이름·대상의 CI 진단을 한 번 실행한다. 기존 `createProject`와 `runPnpm`을 그대로 쓰고 주입 경계에서 원본 잠금, 생성 manifest·workspace, before·after 원문과 해시 및 전체 구조 차이를 staging 밖에 독점 생성한다. 파일 허용 목록은 잠금·manifest·workspace뿐이며 환경·설치물·캐시는 담지 않는다. 기존 verifier와 정리를 유지하고 진단이 재현되지 않아도 다음 runner 호출에서 멈춰 frozen·format·gen·setup·runtime·image로 진행하지 않는다. 외부 진단 native 측정과 runPnpm을 감싼 UTC·wall 측정은 별개이고, 노출되지 않은 내부 pnpm PID·native exit·자체 wall은 null이다. 이 자료는 별도 재현 자료이며 기존 실패의 소급 candidate가 아니다. 진단 성공·실패·비재현·기록 실패 모두 동일한 원래 CLI 오류 객체를 다시 전파한다.

R32는 별도로 승인한 잠재 검사 오류 수정이다. 변경하지 않은 프론트 원본은 `zod@3.25.76`과 `zod@4.6.5`를 함께 갖지만 이전 overlap 검사는 Zod 하나만 허용했다. 선택한 원본들의 정확히 정렬한 Zod package-key 합집합과 direct 4.6.5를 요구하며 새 버전·원본 Zod3 삭제·Zod4 삭제·direct pin 변경을 거절한다. 다른 다섯 overlap 검사와 모든 원본 해석 verifier는 그대로다. Zod 수정은 위 실제 importer 실패의 원인이나 해석 수정이 아니다.

로컬은 실제 Git·파일 생성과 inert pnpm callback만 썼다. 최종 capture 단일 사례는 컴파일되는 pass-through에서 외부 before 자료 누락으로 RED(native 1, 1.315900459초), 동일 테스트 바이트에서 GREEN(native 0, 1.876886458초)이다. SHA256은 `7a725413436d561498c793d07471855f7c2e95643bd284312dcac66d310a2bef`이며 synthetic importer version만 바꾸고 specifier·strict exit 1·한 번의 lock delegate·후속 호출 금지·정리·외부 원문/해시/444 모드·원래 오류 객체 identity를 확인한다. Zod 단일 사례는 실제 원본 `mergeAppLocks`에서 이전 assertion으로 RED(native 1, 1.854597875초), 동일 바이트에서 GREEN(native 0, 1.876776458초)이며 SHA256은 `ce11d231532cf4736d4612161f2fa98ac5c9f173e18896758b90797af627a9b6`이다. 원본·pin 음성 대조도 같은 사례에서 확인했다.

초기 capture GREEN은 마지막 새 fixture 상태 assertion에서 실패했다(native 1, 1.446396500초). 기존 fixture가 의도적으로 남기는 무추적 파일을 깨끗한 상태로 잘못 가정했으며, 승인받아 새 테스트의 초기 상태와 최종 상태를 비교하도록 고쳤다. 원래 RED·실패·정리 자료는 유지했다. 새 파일의 typed lint 오류와 CI 파일 400줄 제한 피드백도 유지하고, 승인된 타입·문법·동일 오류 identity 검사 뒤 최종 동일 바이트 RED/GREEN을 새로 측정했다. lint 면제·기존 fixture 변경·새 skip은 없다.

완전한 create check는 native 0, 45.858688375초로 끝났다. 기존 199개(192 PASS+기존 7 SKIP)에 새 두 사례를 더해 201개(194 PASS+7 SKIP), Vitest 24개 파일과 기존 Node 66 PASS이며 FastAPI golden 대조도 유지했다. 이 기록 뒤 정확한 일곱 파일을 stage하고 루트 11단계와 일반 hook 커밋을 확인한다. 변경하지 않은 prototype 177·통합 43·auth 13·quota 20·적합성 선택 41/94 및 이전 SWC·DI·lazy 결과는 역사적 증거이며 이번에 재실행하지 않았다. 실제 resolution·frozen 설치나 생성 API runtime·Docker·DB·Redis·메일·스토리지는 로컬에서 실행하지 않았다.

새 HEAD의 실제 CI capture는 아직 **pending**이다. 다음 CI가 원래 strict 거절로 실패하며 자료만 남겨도 Task7 수락이 아니다. 실제 before/after로 확인한 최소 해석 수정 뒤 네 생성 변형의 실제 호환 결과와 새 exact-head 14개 작업 성공이 필요하다. 전체 39 operation·126 schema·94 적합성·web 20/admin 18·완전한 OTel·운영 프로세스 신뢰성·standalone 보안 도구/agent hook은 후속 전체 제품 게이트로 남긴다. draft PR은 병합하지 않으며 전체 설계·계획의 게시와 새로운 구체적 사용자 승인이 있어야 SDD를 시작한다.

## Task 7 R33 — 별도 lock 진단의 pnpm 라이프사이클

`675b07699fc43fa51186321c3ae95100f5f52957`의 CI `38251366271`은 14개 작업 중 13개 성공, `create-combo-nestjs-probe` 하나 실패로 완료했다. 정상 035 `pnpm new --api nestjs --web`은 2026-10-12 12:51:20.102–12:51:29.366 UTC, native exit 1, 9.264155219초에 기존 `web: . importer의 해석 결과가 바뀌었다` 거절을 유지했다. 별도 036 진단은 12:51:29.386–12:51:29.824 UTC, exit 1, 0.437705323초에 `pnpm을 찾을 수 없다 — pnpm 12.6.0으로 pnpm new를 실행한다`로 끝났다.

036은 기존 `runPnpm`이 요구하는 `npm_execpath`가 없는 `pnpm exec tsx` 진입이었다. failure의 staging은 null이고 원본 API·web lock 사본과 failure/evidence만 남았다. `capture.json`, before/after lock, diff는 없으므로 실제 해석 후 변경 필드는 여전히 UNKNOWN이다. 원본·native 증거 검증은 tested 675와 materialization `50855ea3358aefd99bca4687d0704f8998ead878`의 125 artifact 파일, 36 native 명령·72 stream, 369 추적 prototype 파일을 묶는다. 265,348바이트 job log의 해시·메타데이터 검증을 전체 수동 열람으로 표현하지 않는다.

R33 변경은 정확히 다섯 경로다. 루트에 private 진단용 `probe:nestjs:lock-capture = tsx create/test/nestjs-probe-lock-capture.ts` 하나를 더하고, `diagnosticPlan`의 실행 prefix만 `run probe:nestjs:lock-capture`로 바꾼다. evidence·binding·separator·target·API·frontend·name 인자는 그대로다. 새 운영 회귀 한 개와 이 두 문서의 append가 나머지다. pnpm 자체 라이프사이클이 진입점을 공급하며 production `runPnpm`, capture 본문·버전 preflight·불변 출력·엄격한 거절·원래 오류 객체·CI guard·후속 phase 중단·소유 정리는 유지한다. pin·lock·resolver·정책·importer guard 변경 근거는 없다.

새 회귀는 `npm_execpath` 없는 직접 CI 호출 형태에서 실제 `diagnosticPlan` launcher를 소유한 inert package/script fixture로 실행한다. stub은 실제 변경 없는 `runPnpm(cwd, ["--version"])`만 호출하고 실제 나머지 인자를 전달받았음을 확인한다. root script key/value와 연결하며 설치·해석·frozen·gen·backend 호출은 없다. 동일한 4,670바이트 테스트 SHA256 `873e12ca2bcee65dbe396c484463e54bd20e1c1fc07f46a1a87633889eeca913`으로 원래 exec launch RED는 native 1/0.757070459초, 수정 후 GREEN은 native 0/0.903759125초였다. RED는 실제 missing-entry 분기까지 도달했고 GREEN은 버전 probe를 완료했다. 각 소유 fixture 제거와 기록된 자식 PID의 종료를 확인했다. 이 시간은 enclosing 테스트 명령이며 `runPnpm` 내부 자식 PID·exit·wall은 공개되지 않아 UNKNOWN이다.

로컬 전체 `pnpm --dir create check`는 exit 0/46.470731375초였다. Vitest 195 PASS + 기존 7 SKIP = 202개, 24 passed/1 skipped 파일과 기존 Node 66 PASS를 확인했다. 기존 capture·Zod 회귀와 원래 201개 선언은 유지한다. 최종 완료 기준은 다섯 파일 전체 staging 뒤 새로운 루트 `pnpm check` 11단계와 일반 hook 커밋이다. 이 절은 그 최종 실행 전 staging용 기록이며 실제 최종 native 결과는 커밋 검증에서 별도로 확인한다. 변경 없는 prototype/SWC/DI/lazy gate는 재실행하지 않는다.

새 exact-head CI는 아직 대기다. 다음 진단 CI도 정상 035에서 실패하면서 before/after를 남길 수 있다. capture 성공은 호환 생성이나 Task 7 성공이 아니다. 실제 diff에 근거한 별도 최소 수정 뒤 네 생성 variant 모두 호환되고 새로운 전체 14개 작업이 성공해야 Task 7을 수용한다. draft PR 12는 병합하지 않으며 전체 Windows 설계·계획, MAIN 두 문서 검증·게시와 새 구체적 사용자 계획 승인은 후속 단계다.

## 프런트 잠금 검증 뒤 API를 합치는 생성 순서

`6cc4da6`의 CI `38261926884`는 13개 성공·생성 프로브 1개 실패로 끝났다. 단독은
완료했지만 web은 원래 CLI의 importer 보존 검사에서 실패했고, 별도 진단도 resolver가 정상
반환한 뒤 같은 엄격한 검사에서 실패했다. admin과 두 프런트 조합은 시작하지 않았다.
별도 진단의 후보를 원래 실패 호출의 후보라고 소급하지 않는다.

실제 before 545190바이트와 after 527592바이트의 119개 고유 변경은 다음과 같다.

| 기제 | 고유 변경 수 | 관측                                                                            |
| ---- | -----------: | ------------------------------------------------------------------------------- |
| M1   |           47 | importer 사이 optional peer 공급으로 OTel·hashes·SWC 등의 peer 문맥 추가        |
| M2   |           11 | workspace 전체의 패키지별 children 소유로 chai·ignore·magic-string·resolve 변경 |
| M3   |           39 | API 원본에서 도달하지 않는 package 19개·snapshot 20개 제거                      |
| M4   |            6 | 전역 TypeScript override가 package의 peer 선언을 6.0.3으로 재표현               |
| M5   |           16 | 예상한 루트 importer·turbo 계열·전역 override 추가                              |

이 설명은 pnpm 12.6.0의 Rust 소스 `a959dce`에 한정한다. npm 배포 tarball의 SHA1·SHA512,
registry integrity·SLSA subject와 tag가 같은 버전·commit을 가리키며, 추출한 소스 553개의
archive 바이트 일치에 근거한다. 서명 암호학 검증과 Linux 실행 배포 tarball digest의 별도
검증은 하지 않았다. 기존 합친 lock에는 루트 importer와 override가 없어 freshness 검사를
통과하지 못하고 모든 importer를 함께 다시 해석하는 경로로 갔다.

생성 순서를 두 단계로 바꾼다. 첫 단계는 API 원본 workspace·lock을 메모리에 보존하고,
API package와 빌드 정책 없이 프런트 workspace·원본 lock만 쓴다. 기존 lockfile-only 호출
한 번 뒤 즉시 모든 원본 프런트 해석을 엄격히 확인한다. 둘째 단계는 최종 API·프런트
workspace와 충돌 없는 allowBuilds 합집합을 복원하고, 실제 첫 단계 결과의 루트·프런트·계약
importer와 override를 그대로 두고 원본 API의 `.`만 `apps/api`로 옮겨 합친다. API의 모든
transitive·orphan 기록을 보존하며, 합친 직후와 기존 frozen 호출 뒤 원본들을 다시 검증한다.
FastAPI 생성 바이트·호출 순서, minimumReleaseAge 1440, TypeScript 6.0.3과 기존 엄격한
부정 제어를 유지한다. API 원본 pin으로 검증한 기존 전역 TypeScript 파생 override만 예외이며,
공유 package의 M4 peer 선언 재표현과 M2 children 변경은 계속 치명적인 오류다.

로컬 새 회귀 4개는 실제 createProject와 추적 원본 API·web lock을 사용한다. 첫 해석 단계의
API 부재, frozen 이전 API 전체 보존·orphan·루트 상태·호출 순서, 실제 CI next importer 변화의
원래 오류 1·대상 정리, 엄격한 병합·workspace 부정 제어를 확인한다. 외부 실행만 PnpmRunner로
대체하고 원본에서 가져온 루트 도구와 정확한 전역 override만 더하므로 실제 pnpm resolver
실험이 아니다. 기존 코드의 API 노출 assertion에서 RED를 확인한 뒤 새 4개가 GREEN이었다.

첫 전체 create 검사는 198개 성공·1개 실패·7개 skip이었다. 보호된 capture 테스트가 web 변경
하나만 기대했지만, 새 첫 단계에서 API importer가 없는 사실도 진단에 나타났기 때문이다.
이 실패를 보존하고 별도 좁은 승인을 받아 기존 sourceImporters 배열 맨 앞에 API 원본 importer의
정확한 removed 항목 하나만 추가했다. 원본 fixture lock에서 기대값을 독립적으로 읽고 원래 web
항목과 나머지 모든 assertion·바이트, capture helper와 CLI 우선 치명적 실패 경로를 유지했다.
변경 뒤 전체 create는 199개 성공·7개 skip(206개, 26파일)과 기존 Node 자산 66개 성공이었다.
프로토타입의 기존 177개·23파일·7단계와 루트 11단계를 완료 검사로 유지한다.

H1(실제 프런트만 해석했을 때 보존), H2(공유 package에서 M4가 발생하지 않음),
H3(원본 API를 합친 lock의 실제 frozen materialization), H4(setup·runtime·build·이미지)는
새 CI에서만 결정한다. 로컬 GREEN으로 네 변형 완료나 CI 성공을 주장하지 않는다. 첫 단계의
진단에 API importer가 없다고 기록하는 것은 그 단계의 실제 상태이며 API 비교를 숨기지 않는다.
기존 실패한 13/1 CI는 그대로 실패다.

R1: 하나의 공유 lock은 이후 add·remove·update나 새 resolving install 때 importer 사이 변경을
다시 만들 수 있다. R2: 기본 hidden hoist가 API 전용 패키지를 프런트에서 런타임에 도달하게
할 수 있어 lock 보존만으로 독립 프런트와 런타임이 같다고 증명하지 못한다. 최종 제품 계획에서
분리된 설치 범위까지 판단해야 한다. 실제 공유 M4 충돌은 중단 조건이며 허용 범위를 넓히지 않는다.

OTel HTTP 1·Express 0·pg 6·Redis 0과 completeness=false, DI의 tsx 미지원, 부분
19 operation·83 schema·41/94 conformance는 유지된다. 전체 39/126/94와 web 20·admin 18,
관측 완전성·process 신뢰성은 미완료다. 이 프로토타입 수정은 최종 NestJS 설계·계획이나 SDD
승인이 아니며, 공개된 구체적 최종 계획에 대한 새 사용자 승인이 필요하다.

## API 병합 거절 뒤의 관측 전용 진단

현재 기준 HEAD `a5dd891`의 CI `38281471605`는 13개 성공·생성 프로브 1개 실패로
끝났다. 단독은 완료했고, web의 정상 035 호출은 첫 단계 프런트 검증을 통과한 뒤
`packages.@typescript-eslint/eslint-plugin@8.71.0`의 엄격한 API 병합에서 실패했다.
036 진단과 after lock은 없으며 admin·두 프런트 조합은 시작하지 않았다. 현재 해석 후
실제 필드 값은 UNKNOWN이다. 이전 `6cc4da6` 진단의 실제 후보와 이 호출을 구분한다.

R37은 Stage A 관측만 허용한다. 기존 `diagnoseImporterFailure`의 native 1 조건에
`(web, api)`·`(admin, api)` 병합 거절과 API verifier의
`해석 결과가 바뀌었다` 메시지를 더한다. 기존 importer 조건과 모든 생성 코드는 유지한다.
일치하는 CreateError의 외부 `failure.json` outcome만 `strict-api-merge-refusal`로
분류하며 boundary stop이 먼저이고 기존 `strict-refusal`·`diagnostic-failure`도 유지한다.
프런트끼리 거절·무관한 실패와 native 0·null·2는 새 진단을 실행하지 않는다.

정상 CLI가 먼저 실행되며 그때 측정한 실패 객체를 항상 그대로 다시 던진다. 별도 진단이나
보고 자체의 실패도 정상 실패를 대체하지 않는다. 진단 대상·이름·binding·argv·출력 모드와
첫 lockfile-only 직후의 경계, finally와 소유 정리는 유지한다. 생성·peer 허용·API 입력
정규화·검증 완화와 Stage B는 이번 범위에 없다.

새 테스트 두 개는 실제 진단 함수와 captureLockResolution이 호출하는 기존 createProject를
사용한다. 변경 전 RED(native 1)는 진단 기록이 빈 배열인 assertion과 실패 outcome이
diagnostic-failure인 assertion에서만 실패했다. 같은 테스트 바이트의 GREEN(native 0)은
web·admin API 거절과 verifier, 음성 native 제어, 진단·보고 오류의 원래 객체 보존을 확인했다.
설치된 fixture의 공유 기록을 첫 단계에서 바꾼 순수 원본 기반 delegate 대역으로 실제 엄격한
둘째 단계 거절까지 실행하고, 외부 before/after·공유 기록 diff·readonly 모드·대상과 staging
제거를 확인했다. 이 대역은 실제 pnpm resolver 실험이 아니며 실제 여섯 기록의 측정값을
대신하지 않는다. 전체 create 검사는 Vitest 201개 성공·기존 7개 skip(208개, 27파일)과
Node 자산 테스트 66개 성공이었다. 기존 모든 테스트 바이트를 유지한다.

pnpm 12.6.0 원본의 override hook과 cycle 재해석 규칙에서 예상한 여섯 TypeScript peer
기록의 변화는 추론이다. 현재 after 값·다른 메타데이터·첫 거절 뒤의 충돌은 측정하지 않았다.
다음 변경 HEAD의 전체 14개 CI는 13 성공·1 실패와 별도 036 관측을 예상하며, 이 예상은
실행 결과나 호환 수용이 아니다. 별도 진단은 두 번째 실제 후보이며
`retrospectiveOriginalCandidate=false`를 유지한다. 그 after 바이트를 원래 035 후보라고
소급하지 않고 정상 실패는 계속 치명적이다.

향후 비교 도구에는 resolved·api·pin·out.json 네 인자가 필요하다. Root가 실제 모든 차이,
동일한 도구 문서·settings, 원본 프런트 importer·snapshot·resolution과 R19의 정확한
override 메타데이터만을 독립 검토한 뒤에야 새로운 Stage B 결정을 할 수 있다. 생성 호환,
네 runtime 변형, Task 7과 전체 NestJS 계획·SDD는 아직 수용하지 않는다.

R1의 이후 add·remove·update·새 resolving install 드리프트와 R2의 hidden hoist 런타임
도달성은 미해결이다. OTel HTTP 1·Express 0·pg 6·Redis 0, completeness=false와
tsx DI 미지원, 부분 19 operation·83 schema·41/94 conformance를 유지한다.
전체 39/126/94·web 20·admin 18·관측 완전성·process 신뢰성은 후속 전체 제품 계획의
검증 항목이며, 새로 공개한 구체적 최종 계획에 대한 사용자 승인 뒤에 SDD를 진행한다.

## 실제 신호와 로그인 시험의 비동기 준비 확인

부모 b12a2bb의 실제 CI 38293140909는 전체 14개 중 12개 성공·2개 실패였다.
생성 프로브의 단독 API check 021은 native 1·49.533271064초로 176/177개를 통과한 뒤
real OS SIGTERM 시험에서 worker.json ENOENT로 실패했다. 단독 생성·frozen·setup은
성공했지만 완료/result는 없고 web·admin·두 프런트 변형은 시작하지 않았다.
035·036·after lock도 없다. 기존 a5dd891의 38281471605 phase 2 package 거절은
별도 실패로 보존하며 현재 CI 실패를 그 해석 결과와 혼동하지 않는다.

real OS signal 시험은 command marker 하나만 기다렸다. runner는 API HTTP readiness 뒤
command onStart를 기록하므로 worker·scheduler fixture의 준비를 보장하지 않는다.
fixture의 기존 PID marker도 종료 handler 설치보다 앞섰다. 이번 수정은 기존 10초 poll에서
api·worker·scheduler·command marker 모두를 기다리고, fixture의 child-close·SIGTERM
처리 설치 뒤 listen callback에서 같은 PID 배열을 기록한다. 실제 운영 runner의 readiness,
종료·그룹 정리 구현과 CI 관측 capture는 바꾸지 않는다.

변경 전 부모 바이트 그대로인 두 코드 파일에 private Node preload를 적용했다.
정확한 server.mjs argv·worker.json basename·aitpl-nestjs-proto-signal- 부모 이름이
모두 맞는 worker만 1200ms 늦춘다. 다른 250ms readiness·로그 tail 시험과 API·command·
다른 Node·자식에는 적용하지 않는다. 이 좁은 조건은 별도 승인받았고 최종 소스에 넣지 않는다.
기존 9개 중 두 real OS SIGINT·SIGTERM 시험이 worker.json ENOENT로만 실패한 native 1
RED를 확인했다. 같은 hook 바이트·환경·argv의 변경 뒤 9개는 native 0 GREEN이었다.
기존 130/143 종료 코드, 세 서버·자식·command PID ESRCH, 세 detached 서버 그룹과
command 그룹 ESRCH, finally cleanup·evidence와 포트 검증을 그대로 유지한다.
고정 sleep·timeout 증가·skip·ESRCH 대체 판정을 추가하지 않았다.

같은 CI의 기본 create-combo web check는 929/930개를 통과하고 로그인 폼의 마지막
line 159에서 이전 재발송 성공 문구의 부재 assertion에 실패했다. queryByText가 반환한
role=status DOM에는 실제 한국어 성공 문구가 남아 있었다. 빈 문구나 queryByRole
시험이 아니다. useActionState의 새 결과가 commit되기 전 즉시 검사한 경합으로,
앱 소유 login-form.test.tsx의 named import에 waitFor를 더하고 그 마지막 같은
부재 assertion 하나만 기본 timeout의 await waitFor로 감싼다. 제품 로그인 폼·feedback·
로딩 UX·번역·shared와 다른 시험은 유지한다. 기존 7개 local 시험과 web 전체
9단계 검사는 native 0이었다. web check는 성공한 자식 출력을 보존하지 않아 로컬 전체
시험 수는 UNKNOWN이며, 실제 CI의 929/930개와 별도로 기록한다. 실제 CI RED의 내부 PID·native wall은 미측정이며
로그의 Vitest 표시 시간이나 다운로드 비용을 native 측정으로 바꾸지 않는다.

web 의존성이 없어 승인받은 기존 설치 트리를 격리 복사해 검사했다. 첫 pnpm exec가
예상 밖 locked pre-run install과 native postinstall을 실행한 사실과 resolution 생략 로그를
보존하고 즉시 별도 판단을 받았다. 원본·locks·pins·guard는 그대로이며 후속 명령은
두 대소문자 환경 변수의 verifyDepsBeforeRun=error로 불일치 때 설치하지 않고 실패하게 했다.
이 로컬 prerequisite와 지연 장치는 실제 Linux resolver나 생성 네 변형 호환 증거가 아니다.
전체 create는 201개 성공·원래 7개 skip(208개, 27파일)과 Node 자산 66개 성공이었다.
정상 환경의 prototype 7단계·177개·23파일과 정확한 다섯 파일 staging 뒤 root 11단계를
완료 기준으로 유지한다. 두 문서는 부모 바이트를 prefix로 보존하는 append만 한다.

로컬 R38 시험 수정의 완료와 CI·Task 7·네 실제 runtime 변형·Stage B·최종 계획·SDD
수용은 구분한다. Root의 전체 소스·diff·보고·native·자원 검토와 정확한 worker 종료 뒤에만
변경 HEAD의 새 전체 14개 CI를 관측한다. 실제 lock 값과 새 prospective ruling 전
Stage B를 진행하지 않는다. R1 resolving drift·R2 hidden hoist, OTel completeness=false,
tsx DI 미지원·부분 19/83·41/94와 전체 39/126/94·web 20·admin 18의 후속 범위는 유지한다.
최종 SDD는 새로 공개한 구체적 전체 계획에 대한 사용자 승인 뒤에 진행한다.

## R39: 파생 TypeScript peer의 정확한 메모리 정렬

부모 acf60171의 CI 38299683750은 전체 14개 중 13개 성공·생성 프로브 1개 실패였다.
원래 035 web 생성은 native 1·6.994370299초로 phase 2의
packages.@typescript-eslint/eslint-plugin@8.71.0에서 거절됐다.
그 뒤 별도로 실행한 새 036 진단은 native 1·3.543255998초로 같은 엄격 병합 거절을
기록하고 after 잠금을 보존했다. 036은 원래 035 후보를 사후에 복원한 것이 아니다.
단독 API의 생성·frozen·setup·check·build·E2E·이미지·정리는 완료됐지만 web은 실패했고
admin·두 프런트 변형은 시작하지 않았다. 이 전체 14개 실패 관측은 Task 7 수용이 아니다.

현재 캡처를 설치된 TypeScript YAML 파서로 대조한 실제 측정은 공유 API package 511개,
snapshot 484개다. 도구 문서·importer는 같고 기존 optional 정규화 뒤 snapshot 차이는 0개다.
메타데이터 차이는 파생 overrides {typescript: 6.0.3} 하나뿐이며, 공유 API 레코드 다섯 개는
기존 peerDependencies.typescript 문자열 `>=4.8.4 <6.1.0`만 6.0.3으로 바뀌었다.
대상은 @typescript-eslint의 eslint-plugin·parser·type-utils·utils와 typescript-eslint이며
모두 8.71.0이다. 실제 프런트 재표현은 이 다섯 개와 eslint-config-next@16.3.8의
`>=3.3.1` → 6.0.3을 합친 여섯 개다. override hook과 cycle에 따른 재해석 설명은
고정 pnpm 소스·순수 그래프 분석의 근거이며 이번 값은 현재 036에서 측정됐다.
내부 runPnpm PID·native exit·wall은 여전히 UNKNOWN이다. 0.466245083초는 캡처를
감싼 wrapper의 wall만 뜻하며 내부 native 측정으로 바꾸지 않는다.

새 R39 구현은 기존 R19 파생 override 조건 아래 공유 API 레코드의 기존 문자열 peer만
신뢰 pin으로 바꿨을 때 전체 객체가 같아지는 경우를 허용한다. API YAML 문서는 병합 직전
메모리에서만 정렬하고, 조건이 없거나 맞는 공유 변화가 없으면 원본 문자열을 그대로 반환한다.
원본 잠금 파일은 쓰지 않는다. peer 추가·삭제, 틀린 pin, engines·integrity·다른 peer·
peerDependenciesMeta·추가 override와 두 번째 변화는 계속 fatal이다. 패키지별 허용 목록이나
포괄적 메타데이터 예외는 없다. 두 검증 루프는 계속 raw API 원본을 검증한다.

mergeApiLock과 기존 R35 세 번째 음성 시험은 그대로이며 raw 입력의 TypeScript peer
재표현을 계속 거절한다. 제품 경로에서만 새 R39의 메모리 정렬과 동일한 전체 레코드 조건의
API 검증을 거친다. importer·도구·메타데이터·snapshot·optional 그래프와 프런트 비교,
FastAPI 대조군·기존 모든 시험·골든·고정 버전·minimumReleaseAge 1440은 유지한다.
@nestjs/schematics@12.0.6·@prisma/client@7.10.0·prisma@7.10.0·valibot@1.4.2의
API 전용 레코드도 원본 그대로다.

새 시험은 실제 소스 잠금을 바이트 그대로 격리 fixture에 복사하고 현재 036의 여섯 변화만
순수 double로 만든다. 실제 resolver·생성 프로젝트 설치·setup·runtime 실험이 아니다.
첫 실행은 두 의도한 양성 실패 외에 기존 fixture의 의도된 무추적 파일을 깨끗하다고 오판한
세 assertion도 실패해 5실패·8통과였고 유효한 전체 RED로 인정하지 않았다.
새 시험만 시작 porcelain과 종료 상태를 비교하도록 승인받아 고친 뒤 같은 명령의
native 1·23.67831099999603초에서 정확한 병합·raw 검증 오류 두 개와 음성 11개 통과를
확인했다. 같은 시험의 GREEN은 native 0·26.308169208001345초, 13개 모두 통과였다.
새 시험 callback의 린트 스타일 오류 12개도 별도 실패로 보존하고 기대값 변경 없이 고쳤다.
전체 create는 실제 214개 성공·기존 7개 skip(221개·28파일), Node 자산 66개 성공이었다.
로컬 완료 gate는 prototype 7단계·177개·23파일과 정확한 다섯 파일 staging 뒤 root 11단계를
포함한다. 두 문서는 부모 전체 바이트를 prefix로 보존한 portable append만 한다.

이 로컬 변경은 CI·Task 7·네 실제 runtime 변형·전체 Nest 계획·SDD 수용이 아니다.
Root의 소스·보고·native·보호 파일·자원 전체 검토, worker release와 새 정확한 positive exit,
변경 HEAD의 새 전체 14개 CI와 standalone·web·admin·both의 실제 생성·frozen·setup·
runtime·E2E·이미지·정리 확인이 남아 있다. 기존 모든 실패 관측과 UNKNOWN은 보존한다.
R1 resolving drift·R2 hidden hoist는 미해결이며 OTel 관측은 불완전하고 tsx DI는 미지원이다.
부분 19/83·41/94를 유지하며 전체 39/126/94·web 20·admin 18의 후속 범위는 별도다.
최종 SDD는 새로 공개한 구체적 전체 계획에 대한 새 사용자 승인 뒤에 진행한다.

최초 prototype 검사는 native 1·1.4488776669604704초로 두 문서 포맷에서 멈췄다.
private cache의 suffix가 ignore 정책에 걸린 앞선 native 0 명령은 실제 포맷 증거가 아니었다.
suffix만 ignore 경로를 명시해 고정 Prettier로 처리하고 부모 prefix를 그대로 보존해 적용했다.

그 다음 prototype는 7단계 통과를 출력했지만 private 관측자가 포트 bind에서 실패해
외부 native 1·16.200977125088684초로 기록됐다. 미보존 내부 top PID·exit·wall은 UNKNOWN이고
당시 EADDRINUSE 원인도 UNKNOWN이다. 기존 관측자 바이트를 보존하고 승인된 새 관측자는
포트 검사 전에 실제 자식 정보를 저장하며 SO_REUSEADDR만 쓰고 실제 bind·listen·close를
요구한다. SO_REUSEPORT·포트 변경·검사 생략·소유 미확인 프로세스 종료는 하지 않았다.
기존 새 단위 기록의 52개 PID·명시된 두 그룹·기록된 두 포트만 별도 확인했으며, 승인된
새 관측 gate는 native 0·15.830062792054377초로 7단계·177개·23파일을 통과했다.
미기록 자원 신원과 ephemeral 포트는 UNKNOWN이며 요청값 0을 실제 과거 포트로 세지 않는다.

문서 range의 line-start가 인용문으로 해석된 표현 오류도 새 suffix의 code span으로 고쳤다.
원래 프런트 범위는 `>=3.3.1`이며 TypeScript pin 6.0.3으로의 실제 재표현이라는 뜻을 유지한다.
