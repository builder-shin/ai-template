import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { it, expect } from "vitest";
import { parseAllDocuments, stringify } from "yaml";
import {
  mergeAppLocks,
  mergeFrontendLocks,
  verifyAppResolutions,
  verifyFrontendResolutions,
} from "../src/lockfile.ts";

interface Lock {
  lockfileVersion: string;
  settings?: { autoInstallPeers: boolean };
  importers: Record<string, unknown>;
  packages: Record<string, unknown>;
  snapshots: Record<string, Record<string, unknown>>;
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error("Missing regression fixture.");
  return value;
}
const key = "shared@1.0.0(peer@2.0.0)";
function sources() {
  const common = {
    "shared@1.0.0": { resolution: { integrity: "shared" } },
    "peer@2.0.0": { resolution: { integrity: "peer" } },
    "cycle@1.0.0": { resolution: { integrity: "cycle" } },
  };
  const nodes = {
    [key]: {
      dependencies: { peer: "2.0.0", cycle: "1.0.0" },
      transitivePeerDependencies: ["peer"],
    },
    "peer@2.0.0": {},
    "cycle@1.0.0": { dependencies: { shared: "1.0.0(peer@2.0.0)" } },
  };
  const api: Lock = {
    lockfileVersion: "9.0",
    importers: {
      ".": {
        optionalDependencies: { shared: { specifier: "1.0.0", version: "1.0.0(peer@2.0.0)" } },
      },
    },
    packages: structuredClone(common),
    snapshots: Object.fromEntries(
      Object.entries(nodes).map(([k, v]) => [k, { ...structuredClone(v), optional: true }]),
    ),
  };
  const web: Lock = {
    lockfileVersion: "9.0",
    importers: {
      ".": { devDependencies: { shared: { specifier: "1.0.0", version: "1.0.0(peer@2.0.0)" } } },
    },
    packages: structuredClone(common),
    snapshots: structuredClone(nodes),
  };
  return { api, web };
}
const text = (value: Lock) =>
  "---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    packageManagerDependencies: {}\n---\n" +
  stringify(value);
const merge = (api: Lock, web: Lock) =>
  mergeAppLocks([
    { app: "web", source: text(web) },
    { app: "api", source: text(api) },
  ]);

it("peer 키·optional 간선·순환 그래프를 보존하고 required 경로가 optional 표식을 바꾼다", () => {
  const { api, web } = sources(),
    original = text(api),
    combined = merge(api, web);
  expect(parseAllDocuments(combined).at(-1)?.getIn(["snapshots", key, "optional"])).toBeUndefined();
  expect(
    parseAllDocuments(combined).at(-1)?.getIn(["snapshots", key, "dependencies", "cycle"]),
  ).toBe("1.0.0");
  expect(() => {
    verifyAppResolutions(original, combined, "api");
  }).not.toThrow();
  expect(() => {
    verifyFrontendResolutions(text(web), combined, "web");
  }).not.toThrow();
  expect(mergeAppLocks([{ app: "web", source: text(web) }])).toBe(
    mergeFrontendLocks([{ app: "web", source: text(web) }]),
  );
});
it.each(["flag", "missing-node", "missing-package", "peer", "edge", "integrity"])(
  "그래프/같은 키의 해석 손상은 거절한다: %s",
  (difference) => {
    const { api, web } = sources();
    if (difference === "flag") delete api.snapshots[key]?.optional;
    if (difference === "missing-node") delete api.snapshots["cycle@1.0.0"];
    if (difference === "missing-package") delete api.packages["peer@2.0.0"];
    if (difference === "peer") required(api.snapshots[key]).transitivePeerDependencies = ["other"];
    if (difference === "edge") required(api.snapshots[key]).dependencies = { peer: "2.0.0" };
    if (difference === "integrity")
      api.packages["shared@1.0.0"] = { resolution: { integrity: "changed" } };
    expect(() => merge(api, web)).toThrow(/그래프|해석/);
  },
);
it("api 검증은 전역 표식 외의 변경·삭제를 거절하고 frontend 비교는 optional에도 엄격하다", () => {
  const { api, web } = sources();
  api.packages["unused@1.0.0"] = { resolution: { integrity: "unused" } };
  api.snapshots["unused@1.0.0"] = {};
  const original = text(api),
    combined = merge(api, web),
    docs = parseAllDocuments(combined),
    doc = required(docs.at(-1));
  doc.deleteIn(["snapshots", "unused@1.0.0"]);
  expect(() => {
    verifyAppResolutions(original, docs.map((d) => d.toString()).join("\n"), "api");
  }).toThrow(/해석/);
  const optional = {
    ...web,
    snapshots: structuredClone(api.snapshots),
    importers: api.importers,
    packages: api.packages,
  };
  expect(() =>
    mergeFrontendLocks([
      { app: "web", source: text(web) },
      { app: "admin", source: text(optional) },
    ]),
  ).toThrow(/snapshots/);
});
it("실제 pinned 세 앱의 모든 importer·패키지 해석·snapshot과 source 그래프를 보존한다", () => {
  const root = resolve(import.meta.dirname, "../..");
  const sources = [
    { app: "api", path: "prototypes/nestjs" },
    { app: "web", path: "templates/nextjs" },
    { app: "admin", path: "templates/nextjs-admin" },
  ].map(({ app, path }) => ({
    app,
    source: readFileSync(resolve(root, path, "pnpm-lock.yaml"), "utf8"),
  }));
  const combined = mergeAppLocks(sources);
  for (const source of sources)
    expect(() => {
      verifyAppResolutions(source.source, combined, source.app);
    }).not.toThrow();
  const doc = required(parseAllDocuments(combined).at(-1));
  expect(doc.getIn(["snapshots", "rolldown@1.2.13", "optional"])).toBe(true);
  expect(doc.getIn(["snapshots", "@oxc-project/types@0.153.0", "optional"])).toBe(true);
});

it.each(["engines", "peerDependencies", "settings"])(
  "실제 api 검증기는 패키지·문서 metadata 변조를 거절한다: %s",
  (field) => {
    const { api, web } = sources();
    for (const source of [api, web]) {
      source.packages["shared@1.0.0"] = {
        resolution: { integrity: "shared" },
        engines: { node: ">=24" },
        peerDependencies: { peer: "^2" },
      };
      source.settings = { autoInstallPeers: true };
    }
    const original = text(api),
      docs = parseAllDocuments(merge(api, web)),
      doc = required(docs.at(-1));
    if (field === "settings") doc.setIn(["settings", "autoInstallPeers"], false);
    else
      doc.setIn(
        ["packages", "shared@1.0.0", field, field === "engines" ? "node" : "peer"],
        field === "engines" ? ">=99" : "^99",
      );
    expect(() => {
      verifyAppResolutions(original, docs.map((d) => d.toString()).join("\n"), "api");
    }).toThrow(/해석/);
  },
);

it("호출자가 명시한 정확한 원본 pin의 파생 TS override만 허용하고 임의 metadata는 거절한다", () => {
  const root = resolve(import.meta.dirname, "../..");
  const inputs = [
    { app: "api", path: "prototypes/nestjs" },
    { app: "web", path: "templates/nextjs" },
  ].map(({ app, path }) => ({
    app,
    source: readFileSync(resolve(root, path, "pnpm-lock.yaml"), "utf8"),
  }));
  const original = required(inputs[0]).source;
  const parsedPackage = JSON.parse(
    readFileSync(resolve(root, "templates/nextjs/package.json"), "utf8"),
  ) as { devDependencies?: { typescript?: unknown } };
  const pin = parsedPackage.devDependencies?.typescript;
  if (typeof pin !== "string") throw Error("Missing source TypeScript pin.");
  const docs = parseAllDocuments(mergeAppLocks(inputs)),
    doc = required(docs.at(-1));
  doc.set("overrides", { typescript: pin });
  const combined = () => docs.map((d) => d.toString()).join("\n");
  expect(() => {
    verifyAppResolutions(original, combined(), "api", pin);
  }).not.toThrow();
  expect(() => {
    verifyAppResolutions(original, combined(), "api");
  }).toThrow(/metadata.overrides/);
  expect(() => {
    verifyAppResolutions(original, combined(), "api", "6.0.4");
  }).toThrow(/metadata.overrides/);
  for (const value of [{ typescript: "6.0.4" }, { typescript: pin, zod: "4.6.5" }]) {
    doc.set("overrides", value);
    expect(() => {
      verifyAppResolutions(original, combined(), "api", pin);
    }).toThrow(/metadata.overrides/);
  }
  doc.set("overrides", { typescript: pin });
  const before = parseAllDocuments(original);
  required(before.at(-1)).set("overrides", { typescript: "6.0.4" });
  expect(() => {
    verifyAppResolutions(before.map((d) => d.toString()).join("\n"), combined(), "api", pin);
  }).toThrow(/metadata.overrides/);
  required(before.at(-1)).delete("overrides");
  required(before.at(-1)).setIn(
    ["importers", ".", "devDependencies", "typescript", "specifier"],
    "6.0.4",
  );
  expect(() => {
    verifyAppResolutions(before.map((d) => d.toString()).join("\n"), combined(), "api", pin);
  }).toThrow(/metadata.overrides/);
  doc.setIn(["settings", "autoInstallPeers"], false);
  expect(() => {
    verifyAppResolutions(original, combined(), "api", pin);
  }).toThrow(/metadata.settings/);
});
