# Add a feature

Use `src/features/posts` as the golden. From the project root:

```text
pnpm gen:feature release-notes
pnpm check
```

The command creates `src/features/release-notes`, public list/detail routes and protected new/edit routes. It adds ko/en keys and explicit entries to `src/lib/navigation/features.json`; the navigation menu, protected stack and safe incoming-path policy consume that registration. A single lower-case kebab name of at most 50 characters is required. Core routes, language/runtime keywords, Windows device names, duplicate names and colliding exports/messages/paths are rejected before writing.

The output is a scaffold: **its API still uses `/posts` and the generated Post contract types**. Review `src/features/release-notes/README.md` before product use. Select the actual API resource, regenerate its types, and review permissions, relationships, fields, both languages and invalidation. Schema and actual native form tests are copied. Posts-specific real HTTP tests remain with the posts golden; add equivalent API/native tests after the new backend contract exists. The generator does not invent backend permissions or operations.

Planning parses and renames TypeScript identifiers without changing generated schema string keys. It validates all outputs, refuses linked ancestors (including dangling links), formats in memory and captures original files. Writing rejects a stale plan, stages every file, and rolls back applied edits on an ordinary filesystem failure. If rollback itself fails, the reported transaction directory retains indexed original backups and a recovery manifest. It never overwrites an existing feature. An OS crash can interrupt a multi-file operation; inspect the changes before retrying, and keep ordinary source-control checkpoints.

Features use other features only through their public index. Native routes are thin exports; feature code owns screens, API calls, validation and keys. Lists scope results by session generation, locale, author and page. Mutations invalidate the relevant post lists/detail, preserving unrelated account/session queries. The editor preserves entered text on server errors. Public lists show published posts; use the own-author filter for drafts. Bodies are edited as Markdown source and displayed as native selectable text.

Run `pnpm gen` for API type changes, `pnpm check`, and both native exports. Exercise real device flows for native behavior. Preserve generation-scoped query keys and reject stale responses after account changes.
