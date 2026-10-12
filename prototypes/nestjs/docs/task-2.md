# Task 2 measurements

Measured on 2026-10-11 UTC / 2026-10-12 KST with Node 24.19.0, pnpm 12.6.0,
installed Zod 4.6.5, Nest common/core/platform-express 12.1.2 and Express 5.2.1.
Versions came from installed package manifests. Task 1's SWC build and Vitest SWC stack
remain selected. This is an authorized evidence prototype; final product SDD still needs
new approval after the full Opus design and plan. CI for this commit is pending coordinator
verification of the exact head and all required jobs.

## Exporter decision and pinned Zod matrix

Approach A is selected: independently authored operation declarations and Zod schemas,
`z.toJSONSchema` with a custom metadata registry, target `draft-2020-12`, input IO, and
the measured normalizer. No contract component is copied into the emitter. Repository
comparison reads the contract only as an oracle. All 83 reachable components and all 39
ErrorCode values are present; all nineteen declarations compare against their contract
operations. The generated document exposes only Health_live and Permissions_list.

The initial matrix ran before schema implementation; an expanded matrix measured the
approved JSON-number alternative after both IO modes captured unsupported BigInt export errors.
Both matrix commands exited 0 while retaining those caught errors. Every row ran in both
input and output modes. The table abbreviates only the repeated root `$schema` declaration;
the private raw outputs retain it and all nested properties.

| Case                                 | Raw installed-version result                                                            | Normalized/declared result and contract comparison                                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Literal `posts`                      | `{"type":"string","const":"posts"}` in both IO modes                                    | Not selected: contract resource types use singleton enum. Nothing deletes const.                                                                                                                                   |
| Singleton enum                       | `{"type":"string","enum":["posts"]}` in both modes                                      | Selected unchanged; matches PostCreateDocument data.type and resource type fields.                                                                                                                                 |
| `z.int32()`                          | integer with minimum -2147483648, maximum 2147483647; no format                         | Implicit limits are not adopted. Own JSON-number declaration emits integer/int32 without implicit bounds. PageMeta uses that shape.                                                                                |
| int32 min 1/max 100                  | integer with exactly minimum 1/maximum 100                                              | Both explicit bounds retained; query page[size] also retains format int32 and default 20.                                                                                                                          |
| `z.int64()` and bounded BigInt int64 | Both modes throw `BigInt cannot be represented in JSON Schema`                          | Native limitation preserved. Coordinator approved the independent finite JSON-number integer declaration, rather than hiding the failure.                                                                          |
| `z.number().int()` + int64 metadata  | minimum -9007199254740991, maximum 9007199254740991                                     | Rejected as implementation choice: it would add a safe-integer constraint absent from the contract.                                                                                                                |
| JSON-number int64                    | `{"type":"integer","format":"int64"}` in both modes                                     | Unchanged; FileAttributes size has its separately declared minimum 1.                                                                                                                                              |
| Bounded JSON-number int64            | integer/int64/minimum 1/maximum 999 in both modes                                       | Explicit bounds remain unchanged; bound probe accepts 1 and 999, rejects 0 and 1000.                                                                                                                               |
| Strict object                        | properties/name, required/name, additionalProperties false in both modes                | Closure is preserved. Native strict object is not used for contract objects which do not declare closure.                                                                                                          |
| Ordinary object                      | input has properties/required; output additionally closes object                        | Select input IO; never remove closure from an emitted strict schema to make comparison pass.                                                                                                                       |
| Empty ordinary object                | input `{"type":"object","properties":{}}`; output also closes                           | Empty properties is an equivalent artefact removed in input; matches empty relationship attributes where used.                                                                                                     |
| String-key record                    | object/propertyNames `{type:string}`/additionalProperties `{type:string}` in both modes | Only unrestricted string propertyNames is redundant. With no declared properties, additionalProperties becomes equivalent unevaluatedProperties. FileUpload.headers matches; nontrivial propertyNames is retained. |
| Nullable string                      | `{"type":["string","null"]}` in both modes                                              | Equivalent anyOf string/null; outer format is retained, including nullable URI fields. Installed result overturned the earlier anyOf hypothesis.                                                                   |
| Discriminated union                  | oneOf branches in both modes; no discriminator; output branches close                   | SessionGrant's discriminator/propertyName/mapping comes from its own declaration metadata, with named PasswordGrant and RefreshTokenGrant refs.                                                                    |
| Registered schemas                   | per-schema registry output has `$id`, Root.child refs Child via configured URI          | Embedded `$schema`/`$id` are removed, component names and refs retained. URI `#/components/schemas/<id>` produces matching refs. A single-schema conversion instead uses `$defs`; registry export is selected.     |
| codePointString min 1/max 2          | string/minLength 1/maxLength 2 in both modes                                            | Unchanged; emoji counts one code point and three characters fail. Contract stored strings use this helper.                                                                                                         |
| Native email/UUID/datetime           | format plus extra native regular-expression pattern in both modes                       | Pattern is not deleted. Own format/refinement declarations avoid adding uncontracted patterns; explicit contract patterns remain. UUID/date-time/email formats remain.                                             |

Normalization provenance is restricted to the record, nullable, empty-object and registered
rows above. It retains required, refs, discriminator, type, format, enum, pattern, explicit
numeric/length bounds and strict-object closure. Comparator annotation removal covers only
description/title; ordering normalization covers unordered enum/required/anyOf arrays.
Preservation tests fail if bounds, pattern, closure or meaningful propertyNames disappear.

JSON-number validation rejects string, boolean, fraction and Infinity. It accepts finite
integer 9007199254740992 without an invented safe-integer cap. `JSON.parse` cannot preserve
9007199254740993 exactly and rounds it to 9007199254740992; this prototype does not claim
arbitrary int64 precision. Final design must decide how JSON-number precision is handled.

Schema comparison measured **83 prototype components, 0 unexplained differences**. Running
the same tool on the untouched FastAPI artifact measured **126 shared-name components,
0 differences**. This is artifact comparison; no FastAPI process/setup/database ran.

## Standard Schema pipe and request ordering

The installed StandardSchemaValidationPipe defaults to transform true and status 400;
`errorHttpStatusCode` changes the status to 422. Transform converted `ok` to `OK`; disabling
it returned original `ok`. exceptionFactory received the original structured Zod issues:
too_big included origin/string, maximum/2, inclusive/true and path/name; invalid_format
included format/email and pattern; invalid_type included expected/number and path/count;
the discriminated branch error retained path grant/value. These fields were not lost.

A real controller with query, path and body pipes recorded starts body/path/query before
any ended. Controlled asynchronous completion recorded body/path/query ends; HTTP 422 from
the body won over query 400 and path 404. The built-in pipe can produce structured error
codes, but independently attached parameter pipes cannot enforce the required aggregate
ordering. A combined JsonApiRequest therefore calls synchronous Zod safeParse directly,
validates query first, then collects path and body issues together. Reusing the pipe inside
that combined point remains possible, but would add exception capture and async result
handling without improving this implementation. No code or meta.params is parsed from an
English message; a test changes the issue message while keeping identical code/params.

HTTP tests prove trace/global-rate-port, negotiation, length/stream counting, strict UTF-8
JSON decoding, guard, combined validation, handler rate and domain precedence. In particular
415 beats 413, 406 beats 413, 413 and JSON 400 beat 401, 401/403 beat query errors, query
400 beats body errors, and path 404 + field 422 becomes HTTP 400 containing both errors.
The limit is 1,048,576 bytes, verified at the exact limit and one byte over without a
Content-Length header. Gzip is not decompressed. Early error responses drain unread input
without buffering it so the actual HTTP response reaches the client. Buffer rendering
produces exactly `application/vnd.api+json`, never a charset suffix; real error output
escapes unpaired surrogates with lowercase hex. Every 401 has WWW-Authenticate Bearer;
unsupported methods become 404 without Allow.

Tests exercise include deduplication and full linkage, sparse fields, sort/filter/page,
duplicate query parameters, empty comma entries, malformed filter brackets, camelCase
filter declarations, offset-required date filters, strict decimal page inputs and preserved
query order/encoding. Real Permissions_list returns total 8 for page size 3/number 2 with
posts:manage, roles:manage and roles:read and the contract's exact pagination links.

## Real local mock differential

check:repo starts the real Hono mock in an owned child, chooses an isolated free TCP port,
passes physical TMPDIR only to child commands and shuts it down with SIGINT. Receipts
include process start/end, actual native exit and cleanup. Twenty stateless invalid cases
compare status, code and source: negotiation, oversize, malformed JSON, structure, type/id,
session discriminator/field, query include/sort/filter/page/duplicates and surrogate input.
Two integer-file cases intentionally observe the unauthenticated 401 priority; separate
authenticated prototype HTTP tests exercise string/boolean/fraction/zero size as 422.

The explicit exclusion list carries the mock's documented FastAPI differences: clocks,
opaque tokens, immediate mailbox/development integrations, cleanup/cache, password
surrogate authentication, origin edges, non-UTF-8/non-JSON-number encodings, aliases,
configuration strictness, trailing-slash redirects, HEAD fallback, uncommon email cases,
lexical float integers and discriminator-name collisions. Those exclusions do not remove
any of the twenty selected comparisons. No real authentication or infrastructure is claimed.

## Bounded Swagger 12.0.2 spike

An owned OS temporary project installed Swagger 12.0.2 with Nest 12.1.2 and Zod 4.6.5.
The bounded install/probe/comparison phase completed within minutes of its two-hour limit.
No spike dependency, lockfile or code entered this project. It used the same registered Zod
schemas and independently declared Posts_create/Posts_list operation metadata. It measured
default conversion and a converter returning `{schema, components}` with input/output IO.

| Item                                                                                                      | Default installed converter                                                                                      | Custom registry converter                                                                                                              |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAPI version                                                                                           | setOpenAPIVersion emits 3.1.0                                                                                    | 3.1.0                                                                                                                                  |
| Nullable/3.1 meaning                                                                                      | Native 3.0 conversion has nullable true, but final 3.1 document rewrites it; final document has no nullable true | Type string/null remains 3.1 compatible                                                                                                |
| Component names / refs                                                                                    | Custom-registry schemas are inline; all 83 expected named components absent                                      | All 83 names and component refs retained                                                                                               |
| Discriminator                                                                                             | Custom declaration metadata is lost by default registry path                                                     | Declaration discriminator/mapping retained                                                                                             |
| Input/output                                                                                              | Both callback schemaType modes observed                                                                          | Both observed; output ordinary objects acquire additionalProperties false                                                              |
| Operation IDs, query parameters, optional Bearer security, Retry-After, x-permission/x-jsonapi extensions | Declared metadata exported; inline schemas differ                                                                | Metadata exported correctly; automatic class tag adds Posts alongside posts                                                            |
| Structural comparison at spike phase                                                                      | 112 operation differences and 83 missing components                                                              | 108 component differences, principally output closure; 3 operation differences (automatic tags and then-missing empty parameters in A) |

The empty parameters omission was later fixed in A after the contract test caught it.
Spike counts above describe the earlier comparison phase, not final A gate results. The
default converter's zero present-component differences is not parity: all named components
were missing. Swagger did correctly convert nullable syntax in the final 3.1 document, so
the older source hypothesis about leaked nullable true was overturned. Approach B did not
meet the no-manual-patch adoption conditions for named schemas and output constraints;
Approach A remains selected. All requested spike items were measured, with no claim of a
production Swagger integration.

Actual nonzero native attempts are retained privately: early schema metadata/nullable format
mismatches, oversized-request connection reset, explicit-optional test typing, lint diagnostics,
the empty parameters comparison, ignored Scarf build and duplicate YAML key during the
temporary install. The caught BigInt unsupported outcomes are distinct from parent exits:
both Zod matrix commands exited 0. The first JS Swagger probe also exited 0, but its missing
reflection metadata omitted the request body/input converter call; that fixture limitation
was corrected before the second probe, which also exited 0. Raw attempts remain unchanged.
Concrete fixes preceded reruns; no requirement was weakened. The Task 1 optional ESLint peer and
route-shadow limitations remain as documented in the original ledger.

## Local acceptance and remaining scope

Local check includes format, lint, typecheck, regenerated OpenAPI equality, source budgets
and all standalone tests. check:repo includes contract rules, all-schema comparison, real
mock differential and subset comparison including oasdiff. Build and the prior real DI,
boundary and route probes remain required. Final command receipts and after-return UTC
durations are recorded privately; check child receipts are reproducible under ignored cache.

The following are observed pre-commit verification runs on 2026-10-11 UTC. Durations are
parent-command wall time after return, not estimates; the private final gate journal remains
authoritative for later runs after final review corrections.

| Run/phase                                          | Command                                       | Native exit | Seconds | Result                                                                |
| -------------------------------------------------- | --------------------------------------------- | ----------- | ------- | --------------------------------------------------------------------- |
| 21:28:33 local verification                        | `pnpm --dir prototypes/nestjs check`          | 0           | 7.924   | Six stages, 95 tests in nine files                                    |
| 21:28:53 repository verification                   | `pnpm --dir prototypes/nestjs check:repo`     | 0           | 1.775   | Four stages, 83 schemas / zero differences, 23 repository tests       |
| 21:29:02 build verification                        | `pnpm --dir prototypes/nestjs build`          | 0           | 0.582   | 54 application files with SWC                                         |
| 21:29:16 DI verification                           | `pnpm --dir prototypes/nestjs probe:di`       | 0           | 2.689   | All five actual transformation paths; prior DI assertions preserved   |
| 21:29:35 isolated copied-project verification      | `pnpm check` after independent frozen install | 0           | 10.907  | No parent repository contract inputs; six stages / 95 tests           |
| 21:30:01 intentional drift probe in copied project | `pnpm gen --check`                            | 1           | 0.436   | Rejects changed declaration with stale artifact; source then restored |
| 21:30:06 generated artifact verification           | `pnpm --dir prototypes/nestjs gen --check`    | 0           | 0.358   | No regeneration difference                                            |
| 21:30:07 root verification                         | `pnpm check`                                  | 0           | 69.005  | Existing eleven stages pass                                           |

The first copied-project attempt used a node_modules symlink, which pnpm rejected as a
non-real hoist directory. Removing only that owned symlink and doing an independent frozen
install resolved the prerequisite. The first full check also caught a generated JSON
formatting difference: gen now applies the project's pinned Prettier configuration itself.
Neither failure was discarded or converted into a passing native exit.

Tasks 3–7 and exact-head CI remain outstanding. Redis rate limits, actual credentials,
Prisma/database execution, mail/storage, images, conformance, frontend E2E and generated
combinations are not represented by the local ports or test doubles. The baseline web 17 /
admin 0 warnings and deferred BFF fairness/timing/socket notes remain unchanged.
