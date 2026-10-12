# Redis jobs, mail and realtime evidence

This evidence prototype implements the nineteen-operation slice. It remains separate from the
final product's 39 operations, 126 schemas, 94 conformance flows, web20/admin18 E2E and four
creation variants. Those later gates and final design approval are still required.

## Installed gateway measurement

`pnpm exec vitest run test/gateway-probe.test.ts` first returned exit0 in0.959460 seconds.
It used installed Nest websocket/Socket.IO packages12.1.2, server4.8.3 and client4.8.4 on an
owned ephemeral loopback listener. Authentication was a test double. Each message was sent
through the actual client, adapter and gateway; literal handler payloads and client ACK outcomes
are in `.cache/realtime/pinned-gateway.json`. Initial console output contained only the Vitest
summary; the artifact was read independently. Subsequent passing runs lock these observations.

| Sent payloads                      | Installed handler payload | Client ACK                                        |
| ---------------------------------- | ------------------------- | ------------------------------------------------- |
| zero                               | `undefined`               | 422 validation.invalid_choice, pointer `/channel` |
| two objects                        | array of two objects      | same422                                           |
| one array                          | that array                | same422                                           |
| one `{channel: "posts"}`           | that object               | `{ok: true}`                                      |
| unknown channel or missing channel | that object               | same422                                           |
| permissionless `posts:all`         | that object               | 403 permission.denied in the dummy                |
| handler returns null or undefined  | the sent object           | no ACK within100ms                                |

There are eighteen rows, nine for subscribe and nine for unsubscribe. Installed adapter source
filters null/undefined responses. The100ms observation is a bounded timeout, not a claim about
all future transport time. The exploratory master-source zero-payload expectation was `[]`;
the installed result is `undefined`. An explicit RealtimeAck on every production handler path
meets the contract, so the Nest gateway remains selected and no raw-server fallback was used.

The dummy returns403 for permissionless unsubscribe too. The production implementation follows
FastAPI's actual distinction: subscribe checks fresh permissions; valid unsubscribe succeeds
without that permission. Local actual production-gateway tests cover both, malformed empty,
surrogate and nonstring tickets versus anonymous absent/null tickets, zero/two/array/missing/
unknown ACKs and anonymous permission denial. Format-invalid ticket tests stop before any Redis
or DB call. Real valid-format missing/reused/expired/revoked tickets remain CI assertions.

## Redis and process behavior

Candidate A is pinned: BullMQ6.3.12, ioredis6.0.0, @nestjs/bullmq12.0.0,
redis-adapter8.3.0 and redis-emitter5.1.0. It is the implementation candidate; actual Valkey9.1.2
compatibility is pending exact-head CI. Candidate B5.81.5 has not been tried and is permitted only
after a concrete candidate-A compatibility failure. No peer/version exception was added.
The existing unused eslint-plugin-import2.32/ESLint10 peer mismatch still makes `pnpm peers check`
exit1; this is the earlier documented limitation, not a passing peer gate.

The first dependency addition exited1 with ERR_PNPM_IGNORED_BUILDS for optional msgpackr-extract.
Its native acceleration is explicitly disabled through `allowBuilds: false`; the package's JS
fallback remains installed. A later frozen install exited0. This does not waive any dependency
peer or supply-chain rule, and earlier pins and workspace policies remain.

Redis clients are lazy, named with DB namespace/process/use and close at application shutdown,
after queues and control subscriptions close. Blocking/BullMQ clients have maxRetriesPerRequest
null. Command failures are bounded. Namespace `aitpl:<0|14|15>` is included in command keys,
BullMQ prefix, control channel and Socket.IO adapter/emitter key. Other DB numbers are refused.
Adapter and control share a subscriber; the server publisher flushes its publish connection
before the after-commit control publication so revoke events precede rechecks on that subscriber.
API uses the server publisher; application contexts use the Redis emitter. Room union targets
are passed together once. Empty room sets do not build payloads or broadcast.

`bootstrap()` enables infrastructure, installs the adapter, listens and starts control delivery.
`createApp()` alone keeps lazy infrastructure inactive for DB-free initialization and HTTP tests;
CI helpers explicitly enable it. Worker and scheduler enter through createApplicationContext.
Run one scheduler operationally, even though the two-process same-id scheduler case checks
registration and execution deduplication. The prototype scheduler tick has no product side
effects; the test worker records it. Production periodic cleanup workloads remain later scope.

Mail jobs contain only `{id}` and use module.verb names. Enqueue and realtime publication are
registered on UnitOfWork commit hooks; rollback discards them. Five total attempts use a custom
5-second linear step,60-second base cap and0–1000ms jitter; success uses removeOnComplete.
The worker commits a fresh verification token on every attempt before SMTP. SMTP runs outside
UnitOfWork's best-effort hooks so a failure reaches BullMQ and schedules a retry. Templates remain
ko/en with escaped HTML and frontend-origin links. Unit tests bound the backoff; real retry
selection and elapsed process delays are still unmeasured until CI.

## Limits, tickets and readiness

Global limits run through the existing priority1 port for `/api/` only and fail open on Redis
errors. Strict limits are in validated handlers at priority8, use an atomic Lua INCR/EXPIRE-NX/TTL
operation and return429 rate_limit.exceeded, Retry-After and retryAfter metadata. Express derives
IP only from configured FORWARDED_ALLOW_IPS; `*` is refused. The complete final per-operation
limit table and deferred BFF shared-IP fairness remain later scope.

Tickets store session/user IDs for30 seconds and consume through GETDEL of a digest key.
Connection rejection uses auth.token_invalid with an ErrorObject status401. Configuration origins
are normalized while incoming Origin headers are compared literally; absent headers are allowed.
The normalizer rejects wildcard, non-http(s), backslash/control characters, non-ASCII hosts and
noncanonical IPv4. WebSocket is the sole transport. Every API rechecks only its own user-room
connections, consulting current session and permissions; failures preserve the connection, while
invalid sessions and lost posts:manage on posts:all disconnect(true). Logout queues the declared
user-room session.revoked payload and a recheck after commit; only the revoked session disconnects.

Health_ready combines independent DB, Redis and S3 HeadBucket probes. It returns a typed
HealthReport with200 or503 application/json and no dependency error details. This task adds no
health spans. Real OTel instrumentation and span exclusion evidence remain Task6; readiness here
is not that future instrumentation acceptance.

## Local and CI boundaries

Local pure tests, actual gateway loopback, generation, SWC and repository comparisons pass.
No real PostgreSQL, Redis, SMTP, storage, Docker, FastAPI or image test was executed locally.
OpenAPI is generated from declarations and now mounts all nineteen operations, with83 reachable
schemas. All prior29 integration cases remain byte-identical, including auth13 and quota20.

CI builds the process entrypoints before running43 serial integration cases: prior29 plus14 new
jobs/realtime/rate-limit cases. These require real SMTP chaos with retries and five attempts,
new committed tokens and raw id-only job data/removal; two scheduler processes; two API processes
and a worker with actual Redis delivery, union deduplication and cross-instance logout; real DB
recheck failure/restoration and permission removal; ticket/Origin/transport checks; DB14/15 pubsub
and control separation; priority1/8 limits, disconnected-client fail-open and atomic twenty-way
counts; real DB/Redis/bucket readiness and absent-bucket503. Process output is captured and printed
only on failure. Measurements record actual PIDs, exits, warnings, selected/elapsed backoffs and
Redis connections before/after close, with no connection-count claim made from local doubles.
Elapsed retry intervals separately allow up to2 seconds of worker scheduling overhead beyond
selected backoff; selected jitter itself must remain0–1000ms. Scheduler initial runs can be
unaligned, so deduplication compares scheduler IDs and schedule slots rather than inventing a
minimum gap between initial executions.

Exact new all-twelve-job CI acceptance is pending coordinator publication and verification.
Task6 and final NestJS SDD are not authorized by this local implementation result.

The first ordinary commit hook also exited1: its redacted finding was the public mail-test password
fixture, whose allow comment had moved to the end of the object call after formatting. The tag
was placed on the literal's line as required by repository rules. The initial URL diagnosis was
an incorrect inference; the diagnostic identifies mail.test.ts, generic-password, line43.
The original failed hook and diagnostic are retained. The first private lock audit selected the
pnpm tool document and exited1; the corrected reader selects the dependency importer and proves
all864 old package/snapshot entries, original importer resolutions and the tool document unchanged.

## First CI setup failure and narrow seed correction

The first exact Task5 head53d46658 reached setup in
[run38188140211](https://github.com/builder-shin/ai-template/actions/runs/38188140211/job/114614865223).
The three owned databases' migrations, the17-file/693199-byte Prisma client generation and
131-file SWC build succeeded. `setup.ts` then invoked `node dist/seed.js`, which exited1 before
the integration command: **0/43 cases executed**, with the test step skipped. The seed subprocess
wall duration and detailed child error were not logged. Observed CI Node24.21.0 differs from
Mac Node24.19.0; this is an environment observation, not a demonstrated cause.

The predecessor PostsModule supplied RealtimePublisher itself. Task5 moved that provider into
global RedisModule, and AppModule includes it. SeedModule still imported only DbModule,
RolesModule, UsersModule and PostsModule, so PostEvents could not resolve RealtimePublisher.
A private reconstructed compiled graph first reproduced the missing provider. Its initial
candidate compile logged a shutdown error because the inert Redis subscriber omitted `off`;
that was an incomplete test double, not real Redis behavior. A separate complete subscriber
probe compiled and closed cleanly; both original observations remain preserved.

The regression now imports **the actual exported SeedModule** rather than repeating its import
list. Inert SETTINGS/Prisma/Storage/Redis overrides keep the production services and publisher
binding real while avoiding infrastructure constructors. It compiles only, resolves PostsService,
RolesService, UsersService, UnitOfWork and the runtime RealtimePublisher, then closes with complete
subscriber `off`/`unsubscribe` methods. No module init, seed, query or network call occurs.
Export alone preserved the original graph and produced the missing-RealtimePublisher failure
(exit1,0.585752s); the sole RedisModule import correction made the test pass (exit0,0.631470s).

Only seed wiring, this regression and portable evidence changed. All43 integration cases,
original29/auth13/quota20 and API/jobs/transport/settings/schema/migrations/versions/workflow
remain unchanged. Task4's corrected real29-case success and historical Task3 six warnings are
retained. BullMQ6.3.12+ioredis6.0.0 remains candidate A with real compatibility unproved; this
provider failure does not authorize a candidate-B switch. New exact corrected-head ALL12 CI,
real seed, SMTP/Redis/process results and43 integration cases remain pending before Task6.

### Corrective local verification

These commands ran sequentially on Mac Node24.19.0/pnpm12.6.0. Seconds are actual parent
command wall durations; they do not measure CI seed or infrastructure behavior.

| Command from `prototypes/nestjs/` | Native exit | Seconds   | Observation                                                               |
| --------------------------------- | ----------- | --------- | ------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`  | 0           | 0.068097  | Existing pins and policies preserved                                      |
| `pnpm check`                      | 0           | 13.442671 | All7 stages;132 tests in17 files                                          |
| `pnpm check:repo`                 | 0           | 1.932346  | All4 stages;23 tests;83 schemas/difference0                               |
| `pnpm build`                      | 0           | 0.399856  | SWC131 files                                                              |
| `pnpm probe:di`                   | 0           | 2.655774  | Selected tsc/SWC/Vitest-SWC graphs match; earlier tsx limitation retained |
| Compiled actual SeedModule probe  | 0           | 0.274826  | Inert infrastructure, compile only, clean close                           |
| Compiled ESM app probe            | 0           | 0.317334  | Lazy infrastructure,19 operations, clean close                            |
| Repository-root `pnpm check`      | 0           | 67.652640 | All11 stages                                                              |

The complete unit suite retains deliberate rate-limit failure and after-commit-hook error
fixture logs; these are passing negative cases. The seed regression and compiled seed probe
had empty stderr. Physical OS tmp conservative tsx IPC length was80 UTF-8 bytes, below100,
with TMPDIR passed only to child commands. No local setup, seed or real infrastructure ran.
