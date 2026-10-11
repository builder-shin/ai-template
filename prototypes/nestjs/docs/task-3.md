# Prisma 7 data layer and authentication core

This prototype adds seven managed tables, a generated ESM client, transactions and tagged
locks, registration/email verification/password and refresh sessions, logout, Me_get and
live role permissions. Eight of the nineteen declared operations are mounted. The public
user serializer has only name and an empty avatar relationship; the avatar column/FK belongs
to the second migration in Task 4. OAuth grants return auth.oauth_code_invalid until the
final implementation. This is prototype evidence, not final NestJS SDD approval.

## Pinned versions and generated client

The installed Prisma CLI, client and adapter-pg are **7.10.0**; pg is **8.23.1**,
argon2 is **0.45.1** and jose is **6.2.12**. Nodemailer is **10.1.0** with bundled types;
@types/pg is **8.23.1**. Registry publication ages exceeded 1440 minutes. Existing runtime,
Nest, TypeScript and frontend pins are preserved. The previously accepted unused optional
eslint-plugin-import / ESLint 10 declared-peer failure remains a limitation.

The [Prisma generator reference](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)
was used to discover moduleFormat and importFileExtension. Their final evidence is the
installed 7.10.0 generator successfully producing and importing ESM files with .js imports
under tsc, SWC and Vitest-SWC. The schema uses @default(uuid(7)). PrismaPg has an explicit
connectionTimeoutMillis of 5000 and shutdown disconnects the client.

The generated client occupies **513741 bytes in 15 files** on macOS. It is ignored:
this size and the unverified Linux byte equality do not justify committing the output.
`gen`, `check` and `setup` recreate it. A manifest records each file's SHA-256, total bytes
and aggregate digest in ignored .cache/prisma-manifest.json. Linux generation and import
will run in the exact-head CI jobs; no platform equality is claimed before that evidence.
`gen --check` separately rejects stale OpenAPI. Prisma receives only DATABASE_URL from
validated loadSettings/process environment through the scripts; prisma.config.ts uses env.
No dotenv direct dependency or implicit .env reader was added.

The first install exited 1 for ignored @prisma/engines and prisma scripts. pnpm wrote
configuration placeholders; an appended duplicate-key configuration then exited 1 before
installing. Replacing those placeholders with exactly the required allowBuilds entries
fixed installation. The allowed alternative argon2 requires its own install script.
The Prisma engines postinstall actually produced schema-engine-darwin-arm64; validate,
generate and empty-to-schema migration diff executed successfully without a database.
No claim is made that migration execution is engine-download-free on a fresh Linux runner.

## Password bytes and access claims

The selected argon2 always receives Buffer.from(surrogatePassBytes(password)), including
missing-account dummy verification. Six encoding vectors match a separately executed Python
standard-library surrogatepass encoder, including a lone high/low surrogate, horse\ud800,
emoji and Korean. The PHC hash proves Argon2id v19, m=65536 KiB, t=3, p=4 and a 32-byte hash.
These match pinned pwdlib 0.3.1's Argon2 defaults and the
[argon2-cffi 25.1.0 default profile](https://github.com/hynek/argon2-cffi/blob/25.1.0/src/argon2/profiles.py).

Actual @node-rs/argon2 2.2.2 probing confirmed the hypothesized string collision:
a\ud800b and a\ufffdb cross-verify when passed as strings. Hashing the surrogatepass
Uint8Array succeeds, but verify rejects that Uint8Array and Buffer with InvalidArg,
invalid utf-8 sequence. The initial uncaught probe exited 1; the expanded caught matrix
exited 0 while retaining both unsupported outcomes. It is not selected or retained as a
dependency. The authorized alternative argon2 0.45.1 accepts those bytes, round-trips the
original password and rejects both cross-verification directions. This is an installed
library input-path observation, not a general Nest product defect.

Local HTTP rejects a constrained lone-surrogate registration password with 422
validation.invalid_format at /data/attributes/password, before database work. Login accepts
the input for byte comparison. The account-level U+FFFD-versus-surrogate login collision
HTTP test requires actual registration, Mailpit and PostgreSQL, so its result is **unverified
until CI**. It must give 401 auth.invalid_credentials, while the original password gives
201; malformed registration must give 422 and none may give 500.

JWT checks require HS256 signature, exp/iat/sub/sid and UUID identifiers. A post-signature
future-iat check retains FastAPI's 30-second allowance without imposing a maximum token age.
Controlled time tests accept +5/+30, reject +31/+3600 as 401 auth.token_invalid, retain an
old iat with future exp and verify expiry mapping and the 30-second expiration leeway.
The installed jose default alone accepted future iat; requiredClaims did not enforce that
boundary. Authenticator reads active session/user/roles and computes permissions every request.
Identifier auditing uses normalized-email HMAC-SHA256; tokens use surrogatepass SHA-256.
Stored BigInt values convert to documents only after Number.isSafeInteger. This conversion
policy does not remove the contract's int64 bounds or claim JSON-number precision recovery.

## Transactions, race expectation and infrastructure isolation

UnitOfWork commits before hooks, discards rollback hooks, and logs hook failure while
continuing later hooks and returning the successful result. The local hook tests use an
explicit unit double. Real commits and multiple physical connections are CI-only evidence.
Repositories use tagged FOR UPDATE/advisory transaction locks; no Unsafe API was added.
The advisory-lock SELECT uses transaction-bound $executeRaw to avoid decoding PostgreSQL
void (OID 2278). Installed adapter source and a corrected DB-free synthetic row-description
probe rejected queryRaw with UnsupportedNativeDataType/void while executeRaw returned 1.
The first coordinator fixture exited 1 before decoding because it lacked argTypes; the
corrected fixture exited 0 and is the measured adapter evidence. Both attempts are retained;
neither is claimed as real PostgreSQL lock execution. The unchanged real connection and
contention test still requires CI.
Verification consumes DELETE RETURNING atomically and deletes remaining same-purpose tokens.
Refresh rows store only hashes, rotate for 30 days and serialize by the old row lock.
The first reuser returns its error outside UnitOfWork, so revocation commits before 401.

The original canonical race expectation said all nine losers should return
401 auth.refresh_token_reused and claimed FastAPI parity. A narrow coordinator ruling
corrects this contradicted expectation: frozen FastAPI checks revoked_at before used_at.
The CI test requires exactly one 201, one first-reuser 401 auth.refresh_token_reused, then
eight 401 auth.token_invalid, a revoked session and 401 for the winning new access and
refresh tokens. Sequential first reuse, WWW-Authenticate Bearer and no-500 remain required.
The ordering is a static-source inference until the actual PostgreSQL race passes.

The infrastructure-only compose project uses the folder name nestjs, fixed baseline ports
and postgres 18.6-alpine TCP pg_isready, Valkey 9.1.2, SeaweedFS 4.47 mini, Mailpit v1.31.2
and mock-oauth2-server 6.0.3. No local compose command or real infrastructure connection ran.
setup creates app/app_test/app_e2e, deploys the generated first migration and seeds admin/member.
DB commands verify compose postgres ownership and reject nonempty foreign databases without
_prisma_migrations or with other-tool tables. CI creates a temporary alembic_version database
and asserts refusal without deleting its tables. Reset's localhost-only rule is unit-tested.

Thirteen serial integration tests use app_test, TRUNCATE RESTART IDENTITY CASCADE and Valkey
DB 15 FLUSHDB before each test, plus Mailpit cleanup. They exercise mail/verification/auth,
audit persistence, logout/permissions, Unicode, three ten-way races, two actual lock
connections, actual commit/rollback hooks and foreign DB rejection. The preflight stops with
“setup을 실행하라” if DB/Valkey are unavailable. Test durations and TRUNCATE samples/mean are
written to .cache/integration/measurements.json and CI output. Those costs are **pending CI**.
An outer transaction plus SAVEPOINT cannot cover committed hooks and competing connections;
it remains an alternative for different tests, not this isolation strategy.

Live drift is placed in CI integration. Installed migrate diff supports
--from-config-datasource --to-schema --exit-code (0 empty, 2 drift). This selected comparison
does not replay migrations into a shadow database; migration deploy precedes it. Its actual
PostgreSQL result and fresh-runner engine behavior remain pending. Revision uses migrate dev
--create-only, which can require a shadow database, so it is outside local checks.

## Observed local phases and remaining acceptance

| Phase                                   | Native exit | Seconds | Observation                                              |
| --------------------------------------- | ----------- | ------- | -------------------------------------------------------- |
| Prisma validate                         | 0           | 0.909   | Schema valid, no DB connection                           |
| Prisma generate                         | 0           | 0.952   | Client generated                                         |
| Empty-to-schema migration diff          | 0           | 1.125   | Seven tables and FKs; SQL saved from generator           |
| Selected Argon2 byte probe              | 0           | 0.145   | Round-trip true, both cross-checks false                 |
| SWC build                               | 0           | 0.764   | 98 source/generated files compiled                       |
| Repository check                        | 0           | 1.846   | Four stages, 83 components/zero differences and 23 tests |
| Prototype check before final JWT review | 0           | 10.023  | Seven stages, 117 tests                                  |
| Final JWT boundary unit tests           | 0           | 0.615   | Eleven security tests                                    |

These are actual pre-commit phase receipts, not estimates or model billing. Final checks
follow the last review edits and are retained with after-return native exits. Staged secret scanning also found public local examples and test credentials; narrowly
scoped line comments resolved the findings, including two comment positions corrected after
formatting. The original redacted 15- and 2-finding native-1 receipts are retained. Earlier
install/type/lint/probe failures were preserved and corrected concretely; no hook bypass,
blanket peer exception, dependency-major change or contract weakening occurred.

Exact-head CI must pass all twelve jobs, including nestjs-prototype-integration, before
Task 4. Existing ten baseline jobs and the predecessor prototype job bytes are unchanged.
No push/PR/merge is performed by this worker. Tasks 4–7 and the full Opus design/plan with
NEW user approval remain required before final NestJS SDD. The existing route-shadow and
optional-peer limitations, web 17/admin 0 warnings and deferred BFF notes remain unchanged.
