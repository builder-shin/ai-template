# NestJS prototype evidence

## Task 1 — toolchain, DI metadata and boundaries

Observed on 2026-10-12 KST (2026-10-11 UTC), macOS arm64, Node **24.19.0**, pnpm
**12.6.0**. This is prototype evidence for a draft branch that must not merge as product.
Final NestJS design/plan approval remains separate. No Docker or real infrastructure ran locally.
CI is **pending coordinator validation on the exact committed head**.

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
| `vite`                              | 8.3.1   | Matches frontend lock resolution and Vitest's `^6.4                                                     |     | ^7  |     | ^8`; published 2026-09-24 |
| `express`                           | 5.2.1   | Exactly the installed Nest Express dependency; needed to set strict routing before adapter construction |
| `@types/express`                    | 5.0.6   | Express 5 types; published 2025-12-01                                                                   |
| `@types/supertest`                  | 7.2.1   | Supertest 7 types; published 2026-07-14                                                                 |
| `@types/node`                       | 24.13.6 | Matches frontend direct pin                                                                             |
| `@eslint/js`                        | 10.0.1  | Matches root pin and supports ESLint 10                                                                 |
| `eslint-import-resolver-typescript` | 3.10.1  | Matches frontend lock resolution, including `.js` → `.ts` resolution                                    |

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

Durations below are observed parent-command wall time. Child stdout/stderr, UTC start/end
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
verify identical correct responses for `current`, `ordinary-id`, `123`, and `currentish`
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

CI has not run locally: `nestjs-prototype` and the existing ten jobs await exact-head PR
validation by the coordinator. Task 2–7 features, Prisma 7.10.0 execution, full JSON:API and
OpenAPI, real infrastructure, conformance, images, frontend E2E and generated combinations
remain outside Task 1. The BFF shared-IP fairness limitation, timing/socket notes and web
warning baseline 17/admin 0 remain deferred and unchanged.
