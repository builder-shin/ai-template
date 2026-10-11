# NestJS prototype — do not merge

Independent Node 24 / Nest 12 / TypeScript 6 ESM prototype. It is outside the root pnpm
workspace and owns its pinned dependencies, lockfile and six-stage local check.

From the repository root:

```sh
pnpm --dir prototypes/nestjs install --frozen-lockfile
pnpm --dir prototypes/nestjs check
pnpm --dir prototypes/nestjs build
pnpm --dir prototypes/nestjs probe:di
pnpm --dir prototypes/nestjs gen --check
pnpm --dir prototypes/nestjs check:repo
```

`createApp()` creates an unbound Express application with body parsing disabled and strict
routing configured before the adapter creates its router. `bootstrap()` listens on port
8000 by default. `/health/live` needs no infrastructure. `/api/v1/permissions` exposes the
eight static permissions with pagination, sparse fields and an Authenticator port. The
default port rejects credentials; actual authentication is Task 3. Tests supply a double.

Task 2 declares the nineteen-operation slice and registers all 83 reachable contract-named
schemas, including realtime payloads and all 39 error codes. App-free `gen` emits OpenAPI
3.1 for only the two mounted operations. Edit declarations and Zod schemas, then run `gen`;
the generated artifact must not be edited by hand. The input schema exporter preserves
explicit constraints; a small measured normalizer handles equivalent representations.

`check` reads only local project inputs. `check:repo` uses the root contract rules bundle,
compares all registered components, starts an isolated local mock for differential tests,
and runs subset spec comparison. It needs the root frozen dependencies and bundled API
rules. No Docker or external infrastructure is involved. Child receipts are written under
ignored `.cache/check`, `.cache/repo-check`, `.cache/jsonapi` and `.cache/differential`.

The DI probe executes Nest CLI tsc, Nest CLI SWC, Vitest SWC, Vitest default Oxc and tsx
in separate processes. It compares all valid provider/controller constructor metadata and
checks the identities of injected dependencies, including circular providers. The invalid
type-import case is recorded separately because its erased metadata differs by compiler.
Raw probe outputs and actual child exits are written under `.cache/di` after each child exits.

ESLint uses typed TypeScript rules, eslint-plugin-boundaries and narrow SQL/comment rules.
Negative fixture directories are excluded from normal lint/typecheck and checked explicitly
through the ESLint API. Positive fixtures cover the allowed layers and module DAG.

The prototype CI job is additive. Existing root checks and CI jobs retain their behavior.
Tasks 1–2 are implemented. Tasks 3–7, real infrastructure, conformance, images, frontend E2E
and generated combinations remain outstanding. Final product SDD needs new user approval
after the full Opus design and plan. CI acceptance remains pending exact-head verification.
See [the evidence ledger](docs/evidence.md) for observed results and limitations.
