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
