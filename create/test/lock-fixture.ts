import { parseAllDocuments, stringify } from "yaml";
import { manager } from "./nestjs-fixture.ts";
import type { LockDocument } from "../src/lock-graph.ts";

export function lockText(input: Partial<LockDocument> = {}): string {
  return (
    manager +
    "---\n" +
    stringify({
      lockfileVersion: "9.0",
      settings: {},
      overrides: { typescript: "6.0.3" },
      importers: {
        ".": { devDependencies: { typescript: { specifier: "6.0.3", version: "6.0.3" } } },
      },
      packages: { "typescript@6.0.3": { resolution: { integrity: "ts-fixture" } } },
      snapshots: { "typescript@6.0.3": {} },
      ...input,
    })
  );
}
export function dependency(source: string): LockDocument {
  return requiredFixture(parseAllDocuments(source).at(-1)).toJS() as LockDocument;
}
export function requiredFixture<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("fixture 입력이 없다");
  return value;
}
