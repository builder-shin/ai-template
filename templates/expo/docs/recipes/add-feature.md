# Add a feature

Use `src/features/posts` as the golden. `pnpm gen:feature <lower-kebab-name>` creates a reviewed draft with public entry point, routes, translations and tests. Adjust its API contract, permissions, fields and invalidation. Features use other features only through their public index.

Run `pnpm gen` for API type changes, `pnpm check`, and both native exports. Exercise real device flows for native behavior. Preserve generation-scoped query keys and reject stale responses after account changes.
