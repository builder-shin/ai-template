# NestJS prototype — do not merge

Independent Node 24 / Nest 12 / TypeScript 6 ESM prototype. It is outside the root pnpm
workspace and owns its pinned dependencies, lockfile and five-stage check.

From the repository root:

```sh
pnpm --dir prototypes/nestjs install --frozen-lockfile
pnpm --dir prototypes/nestjs check
pnpm --dir prototypes/nestjs build
pnpm --dir prototypes/nestjs probe:di
```

`createApp()` creates an unbound Express application with body parsing disabled and strict
routing configured before the adapter creates its router. `bootstrap()` listens on port
8000 by default. `/health/live` needs no infrastructure. The permission registry matches
the eight contract codes; it does not expose a permissions endpoint yet.

The DI probe executes Nest CLI tsc, Nest CLI SWC, Vitest SWC, Vitest default Oxc and tsx
in separate processes. It compares all valid provider/controller constructor metadata and
checks the identities of injected dependencies, including circular providers. The invalid
type-import case is recorded separately because its erased metadata differs by compiler.
Raw probe outputs and actual child exits are written under `.cache/di` after each child exits.

ESLint uses typed TypeScript rules, eslint-plugin-boundaries and narrow SQL/comment rules.
Negative fixture directories are excluded from normal lint/typecheck and checked explicitly
through the ESLint API. Positive fixtures cover the allowed layers and module DAG.

The prototype CI job is additive. Existing root checks and CI jobs retain their behavior.
No infrastructure, conformance, image or frontend E2E evidence is claimed for this task.
See [the evidence ledger](docs/evidence.md) for observed results and limitations.
