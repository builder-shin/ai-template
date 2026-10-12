# Golden posts and presigned files

This draft prototype implements the five posts and four files operations. Seventeen of
nineteen slice operations are mounted; health readiness and realtime tickets remain for the
next phase. Final NestJS design/plan approval is separate. No real infrastructure ran locally.

## Decisions

Posts page count, rows and requested includes use the same interactive transaction with
`RepeatableRead`. Only posts reads select this isolation; auth, refresh and quota retain their
existing transaction behavior. Authors and cover files each load one deduplicated ID batch,
without Prisma relation joins or the `relationLoadStrategy` preview. The CI SQL observer counts
actual emitted statements for identical `include=author,coverImage` requests at sizes 1 and 20.
Four SELECTs are expected; transaction control statements are also recorded and compared.
An HTTP service test instruments the count boundary, reads the actual isolation/PID and commits
an insert on another connection before the page SELECT. Its snapshot assertions run only in CI.
This proves the service's selected options when it runs, rather than only a manually selected test
transaction. Korean title ordering is recorded with PostgreSQL's actual database collation.

Draft visibility requires an own-author filter or posts:manage for lists, and author/manage
access for detail. Visible forbidden writes return 403; hidden drafts return 404. Status
transitions preserve publishedAt for the same status and clear it on withdrawal. Includes always
serialize authors as public name/avatar relationships. Sparse fields retain file download meta.
Cover replacement/deletion removes unreferenced rows in the transaction and schedules object
removal after commit. Posts and user avatar references are registered through the module registry;
files do not import either domain. Avatar FK/data and /me include are present without adding a
profile-write endpoint. Anonymous file reads require a visible published cover in this slice.

`RealtimePublisher.queue` is the only event path. Registered declarations resolve published and
wasPublished rooms; withdrawal sends only an identifier to the public room. Recording delivery
builds payloads in after-commit hooks, discards rollback hooks and skips empty rooms. Socket.IO
transport and cache remain outside this phase. The second migration is Prisma-generated;
the committed first migration and existing auth constraints are preserved. Seed adds two
published examples and one draft only if that author has no posts.

AWS SDK client-s3 and s3-request-presigner are pinned to 3.1149.0, published on 2026-10-09 and
older than the independent 1440-minute release-age policy. Imports use package roots. Internal
S3_ENDPOINT_URL performs HEAD/delete/setup; S3_PUBLIC_ENDPOINT_URL signs client URLs. Clients
use path addressing, WHEN_REQUIRED request/response checksums and static configured credentials.
PUT expires in 900 seconds and signs content-length plus content-type; GET expires in 600 seconds.
The browser supplies its body's Content-Length. Upload meta returns only Content-Type, matching
the existing API and avoiding a browser-forbidden header. Files validate size, type and quota in
that order. Pending and ready bytes both count under the transaction-scoped files:quota:user lock.

## Local observations

| Check                                     | Actual result                                                                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installed SDK no-network presign          | exit 0; SignedHeaders `content-length;content-type;host`, algorithm `AWS4-HMAC-SHA256`, no checksum query                                                                   |
| Default SDK comparison                    | exit 0; SignedHeaders `content-length;host`; `x-amz-checksum-crc32=AAAAAA==` and `x-amz-sdk-checksum-algorithm=CRC32`                                                       |
| Changing independently signed length/type | Both change the actual signature                                                                                                                                            |
| Actual Nest/Supertest loopback lifecycle  | exit 0; 10 and 20 concurrent liveness requests all200; baseline/peak/after listening1,error0,close0; maxListeners10; zero observed MaxListeners warnings; explicitly closed |
| Own check                                 | exit 0; seven stages, 124 local tests across fourteen files                                                                                                                 |
| Repository comparison                     | exit 0; four stages, 23 tests, 83 schemas/zero structural differences                                                                                                       |

The lifecycle observation uses real Nest12.1.2/Supertest7.3.1 and loopback HTTP, without DB/auth/
storage. Integration helpers now await explicit ephemeral loopback listen and own teardown;
concurrency remains ten for existing races and twenty for quota. Original and corrected Task3
CI each passed thirteen auth tests and emitted six transient listening/error warnings. Those
historical observations remain unchanged. The first Task4 run recorded seven closed suite lifecycles
with warnings[] and maxListeners10, and zero raw MaxListeners warnings; this is scoped to that run.
No listener limit is increased and no warning is suppressed. A startup-amplification explanation is supported
by the installed Supertest source and earlier pure-Node probe, without claiming a persistent leak
or a proven Linux integration cause from the local probe alone.

Meaningful local policy/quota-order/event tests use explicitly identified unit doubles; they
are not PostgreSQL, storage signature enforcement or commit acceptance. Raw command failures
are retained privately: recorder argument errors prevented two initial commands from launching;
two Prisma attempts lacked DATABASE_URL; generic schema typings, optional properties and query
observer typing needed correction; lint caught deprecated safe(), empty-object types, type imports,
unsafe test matchers and test instrumentation typing. A stale unmounted-post test expectation was
changed to the still-unmounted roles path after posts became implemented. The first formatter
attempt named a Prisma schema for which Prettier has no parser. No native failure was relabeled.

## First real CI result and permission fixture correction

[Run38184340281](https://github.com/builder-shin/ai-template/actions/runs/38184340281), at
commit7ced12ab1bc910c5b9799a475af45531b224e615, executed all29 integration cases in14.30 seconds
and exited1:28 passed and one failed. The permission/Unicode case expected403 but received201
before reaching its Unicode boundary assertions. `RolesRepository.assign` upserts the named roles
additively; assigning an empty list correctly leaves the existing member role intact. The fixture
had therefore retained posts:create. The operation guard already recalculates effective permissions
on every request. This failure does not establish a production permission defect or prove the
100000/100001 Unicode boundaries in real CI.

The narrow correction deletes only this actor's userRole rows inside UnitOfWork, checks the
committed absence and /me roles/permissions, then requires POST403 permission.denied. It restores
member through the existing additive API, checks the persisted member and /me posts:create, and
requires the original100000-code-point create to return201. The100001422 code/pointer/max100000
and seed-unchanged assertions remain. Runtime roles/auth/guard/domain code, migrations, dependencies,
workflow, original auth13, quota20 and all29 case declarations are unchanged.

The failed run separately recorded successful real observations:

- Auth13 passed, including refresh1 winner/1 reuser/8 revoked-session losers and separate lock
  connections136/131 with first-lock → first-end → second-lock ordering.
- Seaweed rejected the signed4-byte PUT carrying5 actual bytes and Content-Length5 with403
  SignatureDoesNotMatch and no object. Changed-type rejection and other upload cases passed.
- Identical include paths at page sizes1/20 emitted4 SELECTs/5 observed statements each.
  The actual service snapshot selected repeatable read, with reader196/writer205,2 externally
  committed rows and stable total1/pageRows1.
- Quota20 yielded ten201/ten422, stored1024 bytes and11 pending rows. Two actual storage:setup
  executions preserved22 sentinel bytes and replaced CORS, each with native exit0.
- All seven suite lifecycles closed explicitly with warnings[]/maxListeners10. Historical six
  warnings in each Task3 run remain unchanged; no warning suppression is used.

These observations belong to the failed original run. They do not make its whole CI successful.
The corrected commit still needs a fresh exact-head result for all twelve required jobs; actual
permission removal/restoration and Unicode acceptance remain pending that run. No real integration
test was rerun locally.

## Pending corrected exact-head CI acceptance

`test:integration` retains the original auth13 and adds sixteen posts/files/setup tests (29 total).
The test runner requires all seven suite measurement files and the auth count, uses app_test,
Valkey15 and a unique owned aitpl- storage prefix, and clears only that prefix. It records actual
SQL, timings, truncate mean, listener warnings and closes the owned HTTP servers. Infrastructure
remains CI-only. Required evidence includes:

- Upload/complete/GET bytes; wrong-length and wrong-type actual Seaweed403. The +1-byte PUT
  explicitly transmits matching body/header length that differs from the signed declaration;
  status, body and HEAD object observation are retained before assertions. An accepted PUT
  throws the explicit STOP condition. A local fetch exception cannot satisfy this test.
- Completion422 for missing/mismatched objects, deletion of mismatches, PDF422, numeric max,
  hidden404/visible403, published-cover anonymous read and actual included download URLs.
- Twenty quota requests with a small1024-byte test quota: ten201 and ten422 at the chosen
  starting size, persisted sum1024, independently available quota for another owner.
- Posts visibility/filter/sort/page/include/fields, supplementary Unicode100000/100001,
  real service RepeatableRead snapshot, constant actual SQL count, transitions, same-transaction
  admin audit, reference preservation, rollback and after-commit object/event observations.
- Two actual storage:setup subprocess executions preserving sentinel bytes while replacing
  deliberately stale CORS with GET/PUT/HEAD, all request headers, ETag and maxAge3000.

Corrected CI acceptance is pending coordinator publication and verification of this exact commit's all
twelve required jobs. No whole-product conformance, frontend E2E, generated combination, actual
Socket.IO transport, Task5 or final SDD acceptance is claimed.

Exploratory official documentation:
[AWS presigner](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/)
and [Prisma v7 transactions](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions).
Pinned installed source and the actual local/CI executions determine the behavior above.
