import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAllDocuments } from "yaml";
import { expect, it } from "vitest";
import { mergeAppLocks, verifyAppResolutions } from "../src/lockfile.ts";

interface Lock {
  packages: Record<string, unknown>;
  snapshots: Record<string, unknown>;
  importers: Record<
    string,
    { dependencies: Record<string, { specifier: string; version: string }> }
  >;
}
// The protected declaration file describes the old exports; this new pure export is typed here.
const modulePath = "./nestjs-probe-ci-support.mjs";
const { assertZodOverlap } = (await import(modulePath)) as {
  assertZodOverlap: (
    data: Lock,
    sources: { app: string; data: Lock }[],
    combo: boolean,
  ) => { packageKeys: string[] };
};

it("preserves exactly the actual source Zod keys and required direct pin", () => {
  // A blanket multiversion allowance or a lost source/transitive/direct version breaks this case.
  const root = resolve(import.meta.dirname, "../..");
  const sources = [
    { app: "api", source: readFileSync(resolve(root, "prototypes/nestjs/pnpm-lock.yaml"), "utf8") },
    { app: "web", source: readFileSync(resolve(root, "templates/nextjs/pnpm-lock.yaml"), "utf8") },
  ];
  const combined = mergeAppLocks(sources);
  for (const source of sources) verifyAppResolutions(source.source, combined, source.app);
  const data = parseAllDocuments(combined).at(-1)?.toJS() as Lock;
  const originals = sources.map(({ app, source }) => ({
    app,
    data: parseAllDocuments(source).at(-1)?.toJS() as Lock,
  }));
  expect(assertZodOverlap(data, originals, true).packageKeys).toEqual(["zod@3.25.76", "zod@4.6.5"]);
  const extra = structuredClone(data);
  extra.packages["zod@4.6.6"] = {};
  expect(() => assertZodOverlap(extra, originals, true)).toThrow("Overlap version changed: zod");
  const removed3 = structuredClone(data);
  delete removed3.packages["zod@3.25.76"];
  expect(() => assertZodOverlap(removed3, originals, true)).toThrow("Overlap version changed: zod");
  const removed4 = structuredClone(data);
  delete removed4.packages["zod@4.6.5"];
  expect(() => assertZodOverlap(removed4, originals, true)).toThrow("Overlap version changed: zod");
  const api = data.importers["apps/api"];
  expect(api?.dependencies.zod).toEqual({ specifier: "4.6.5", version: "4.6.5" });
  const changedPin = structuredClone(data);
  const changedImporter = changedPin.importers["apps/api"];
  if (!changedImporter) throw Error("Missing actual API importer");
  changedImporter.dependencies.zod = { specifier: "4.6.6", version: "4.6.6" };
  expect(() => assertZodOverlap(changedPin, originals, true)).toThrow(
    "Required direct Zod pin changed",
  );
  const missingPin = structuredClone(data);
  const missingImporter = missingPin.importers["apps/api"];
  if (!missingImporter) throw Error("Missing actual API importer");
  delete missingImporter.dependencies.zod;
  expect(() => assertZodOverlap(missingPin, originals, true)).toThrow(
    "Required direct Zod pin changed",
  );
});
