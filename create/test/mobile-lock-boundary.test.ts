import { expect, it } from "vitest";
import { parseAllDocuments, stringify } from "yaml";
import {
  mobileLock,
  verifyMobileBoundary,
  configureMobileBoundary,
  mobileWorkspace,
} from "../src/mobile-workspace.ts";
import { temporaryFolder, write } from "./helpers.ts";

const lock = `---
lockfileVersion: '9.0'
importers:
  .:
    packageManagerDependencies: {}
---
lockfileVersion: '9.0'
overrides: {typescript: 6.0.3}
importers:
  .:
    dependencies:
      react: {specifier: 19.3.0, version: 19.3.0}
      native: {specifier: 0.88.0, version: 0.88.0(react@19.3.0)}
  contract/mock:
    dependencies:
      hono: {specifier: 4.0.0, version: 4.0.0}
packages:
  react@19.3.0: {resolution: {integrity: react}}
  native@0.88.0: {resolution: {integrity: native}}
  hono@4.0.0: {resolution: {integrity: hono}}
snapshots:
  react@19.3.0: {}
  native@0.88.0(react@19.3.0): {dependencies: {react: 19.3.0}}
  hono@4.0.0: {}
`;
it("retains the exact app peer closure and tool prefix while removing contract importers", () => {
  const result = mobileLock(lock),
    docs = parseAllDocuments(result);
  const doc = docs.at(-1);
  if (!doc) throw new Error("Missing dependency document");
  const data = doc.toJS() as {
    importers: Record<string, unknown>;
    packages: Record<string, unknown>;
    snapshots: Record<string, { dependencies?: Record<string, string> }>;
  };
  expect(result.slice(0, result.indexOf("---", 4))).toBe(lock.slice(0, lock.indexOf("---", 4)));
  expect(Object.keys(data.importers)).toEqual(["."]);
  expect(Object.keys(data.snapshots)).toEqual(["react@19.3.0", "native@0.88.0(react@19.3.0)"]);
  expect(data.packages["hono@4.0.0"]).toBeUndefined();
  const root = temporaryFolder();
  write(root, "apps/mobile/pnpm-lock.yaml", result);
  verifyMobileBoundary(root, lock);
  const native = data.snapshots["native@0.88.0(react@19.3.0)"];
  if (!native?.dependencies) throw new Error("Missing native graph");
  native.dependencies.react = "19.2.0";
  write(root, "apps/mobile/pnpm-lock.yaml", result.slice(0, doc.range[0]) + stringify(data));
  expect(() => {
    verifyMobileBoundary(root, lock);
  }).toThrow();
});
it.each(["contract/../bad", "../contract/mock", "contract\\mock", "contract//mock", "tools/other"])(
  "rejects unsafe importer %s before install",
  (path) => {
    expect(() => mobileLock(lock.replace("  contract/mock:", `  ${path}:`))).toThrow();
  },
);
it("requires both app and contract importers", () => {
  expect(() =>
    mobileLock(lock.replace("  .:\n    dependencies:", "  missing:\n    dependencies:")),
  ).toThrow();
  expect(() =>
    mobileLock(
      lock.replace(
        "  contract/mock:\n    dependencies:\n      hono: {specifier: 4.0.0, version: 4.0.0}\n",
        "",
      ),
    ),
  ).toThrow();
});
const policy =
  "packages: [contract/*]\nminimumReleaseAge: 1440\nallowBuilds: {lefthook: false}\noverrides: {typescript: 6.0.3}\n";
it("rejects changed age/override before an installation", () => {
  expect(() => mobileWorkspace(policy.replace("1440", "0"))).toThrow();
  expect(() => mobileWorkspace(policy.replace("6.0.3", "5.0.0"))).toThrow();
  expect(() => mobileLock(lock.replace("typescript: 6.0.3", "typescript: 5.0.0"))).toThrow();
});
it.each(["workspace", "lock"])("detects installation changing the retained %s boundary", (kind) => {
  const root = temporaryFolder();
  write(root, "apps/mobile/package.json", "{}");
  expect(() => {
    configureMobileBoundary({
      root,
      sourceLock: lock,
      sourceWorkspace: policy,
      pnpm: (cwd) => {
        if (kind === "workspace")
          write(cwd, "pnpm-workspace.yaml", policy.replace("lefthook: false", "lefthook: true"));
        else
          write(
            cwd,
            "pnpm-lock.yaml",
            mobileLock(lock).replace("integrity: native", "integrity: changed"),
          );
      },
    });
  }).toThrow();
});
