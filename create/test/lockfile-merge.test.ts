import { expect, it } from "vitest";
import { parseAllDocuments } from "yaml";
import {
  mergeFrontendLocks,
  rewriteImporters,
  verifyFrontendResolutions,
} from "../src/lockfile.ts";
import { lock } from "./combo-fixture.ts";

const merge = (admin = lock) =>
  mergeFrontendLocks([
    { app: "web", source: lock },
    { app: "admin", source: admin },
  ]);

it.each([
  {
    label: "missing root",
    source: lock.replace("\n  .:\n    dependencies:", "\n  contract/no-app:\n    dependencies:"),
  },
  ...[
    "contract/../../outside",
    "contract/./mock",
    "contract//mock",
    "contract/mock/",
    "contract/a\\..\\outside",
  ].map((path) => ({ label: path, source: lock.replace("contract/mock:", `${path}:`) })),
])("앱 importer 누락과 비정규 계약 경로를 앱별로 거절한다 ($label)", ({ source }) => {
  for (const app of ["web", "admin"]) {
    expect(() => rewriteImporters(source, app)).toThrow(new RegExp(`${app}.*importer`));
    expect(() => mergeFrontendLocks([{ app, source }])).toThrow(new RegExp(`${app}.*importer`));
  }
});

it.each([
  { label: "malformed", source: "importers: [", reason: "잠금 파일" },
  { label: "missing importer", source: "lockfileVersion: '9.0'\n", reason: "importer" },
  {
    label: "invalid path",
    source: lock.replace("contract/mock:", "other/app:"),
    reason: "other/app",
  },
])("잘못된 잠금 입력은 앱과 복구 경로를 알린다 ($label)", ({ source, reason }) => {
  for (const app of ["web", "admin"]) {
    const expected = new RegExp(`${app}.*${reason}.*—.*${app}.*pnpm`);
    expect(() => rewriteImporters(source, app)).toThrow(expected);
    expect(() => mergeFrontendLocks([{ app, source }])).toThrow(expected);
  }
});

it("앱 importer와 고유 패키지는 합치고 같은 계약·패키지·도구는 한 번 보존한다", () => {
  const admin = lock
    .replace(
      "react: {specifier: 19.3.0, version: 19.3.0}",
      "extra: {specifier: 1.0.0, version: 1.0.0}",
    )
    .replace("packages:\n", "packages:\n  extra@1.0.0: {resolution: {integrity: extra}}\n")
    .replace("snapshots:\n", "snapshots:\n  extra@1.0.0: {}\n");
  const combined = merge(admin);
  const docs = parseAllDocuments(combined);
  expect(docs).toHaveLength(2);
  const dependency = docs[1]?.toJS() as Record<string, Record<string, unknown>>;
  expect(Object.keys(dependency.importers ?? {})).toEqual([
    "apps/web",
    "contract/mock",
    "apps/admin",
  ]);
  expect(Object.keys(dependency.packages ?? {})).toEqual(["react@19.3.0", "extra@1.0.0"]);
  expect(() => {
    verifyFrontendResolutions(lock, combined, "web");
  }).not.toThrow();
  expect(() => {
    verifyFrontendResolutions(admin, combined, "admin");
  }).not.toThrow();
  expect(() => {
    verifyFrontendResolutions(
      admin,
      combined.replace("integrity: extra", "integrity: changed"),
      "admin",
    );
  }).toThrow(/admin.*해석/);
});

it.each([
  ["contract/mock", (source: string) => source.replace("version: 4.0.0", "version: 4.0.1")],
  [
    "packages.react@19.3.0",
    (source: string) => source.replace("integrity: fixture", "integrity: other"),
  ],
  [
    "snapshots.react@19.3.0",
    (source: string) =>
      source.replace("react@19.3.0: {}", "react@19.3.0: {dependencies: {other: 1.0.0}}"),
  ],
  [
    "도구",
    (source: string) =>
      source.replace(
        "packageManagerDependencies: {}",
        "packageManagerDependencies: {pnpm: 12.7.0}",
      ),
  ],
  [
    "settings",
    (source: string) =>
      source.replace(
        "importers:\n  .:\n    dependencies:",
        "settings: {autoInstallPeers: false}\nimporters:\n  .:\n    dependencies:",
      ),
  ],
])("같은 키의 다른 해석을 덮어쓰지 않고 거절한다: %s", (key, change) => {
  expect(() => merge(change(lock))).toThrow(new RegExp(`${key.replaceAll(".", "\\.")}.*—`));
});

it("다른 계약 importer 목록과 앱 밖 importer를 거절한다", () => {
  expect(() => merge(lock.replace("contract/mock:", "contract/other:"))).toThrow(
    /계약 importer.*—/,
  );
  expect(() => merge(lock.replace("contract/mock:", "other:"))).toThrow(/importer 경로.*—/);
});
