export function importerResolutionDiff(
  beforeLock: string,
  afterLock: string,
  importers: readonly string[],
): readonly { importer: string; name: string; before: string; after: string }[];
