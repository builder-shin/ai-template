import { expect, it } from "vitest";
import { optionalReachability, type LockDocument } from "../src/lock-graph.ts";
import { mergeApiLock, verifyAppResolutions } from "../src/lockfile.ts";
import { dependency, lockText } from "./lock-fixture.ts";

function graph(): LockDocument {
  return {
    importers: {
      "apps/api": {
        dependencies: { root: { version: "1.0.0(peer@2.0.0)" } },
        optionalDependencies: { optional: { version: "1.0.0" } },
      },
    },
    packages: Object.fromEntries(
      ["root@1.0.0", "optional@1.0.0", "shared@1.0.0", "leaf@1.0.0"].map((key) => [
        key,
        { resolution: { integrity: key } },
      ]),
    ),
    snapshots: {
      "root@1.0.0(peer@2.0.0)": {
        dependencies: { shared: "1.0.0" },
        optionalDependencies: { leaf: "1.0.0" },
      },
      "optional@1.0.0": { dependencies: { shared: "1.0.0", leaf: "1.0.0" } },
      "shared@1.0.0": {},
      "leaf@1.0.0": {},
    },
  };
}
it.each([
  { label: "pnpm 9 importer", importer: "real@1.0.0", snapshot: "2.0.0" },
  { label: "pnpm 9 snapshot", importer: "1.0.0", snapshot: "@scope/leaf@2.0.0" },
  { label: "pnpm 9 양쪽", importer: "real@1.0.0", snapshot: "@scope/leaf@2.0.0" },
  { label: "npm 접두사", importer: "npm:real@1.0.0", snapshot: "npm:@scope/leaf@2.0.0" },
])("$label 별칭 간선은 실제 패키지를 따른다", ({ importer, snapshot }) => {
  const lock: LockDocument = {
    importers: {
      ".": { dependencies: { [importer === "1.0.0" ? "real" : "alias"]: { version: importer } } },
    },
    packages: { "real@1.0.0": {}, "@scope/leaf@2.0.0": {} },
    snapshots: {
      "real@1.0.0": {
        optionalDependencies: { [snapshot === "2.0.0" ? "@scope/leaf" : "leaf-alias"]: snapshot },
      },
      "@scope/leaf@2.0.0": {},
    },
  };
  expect(Object.fromEntries(optionalReachability(lock, ["."]))).toEqual({
    "real@1.0.0": false,
    "@scope/leaf@2.0.0": true,
  });
});
it("필수 경로가 선택 경로보다 우선하고 peer 문맥을 포함한 정확한 간선을 따른다", () => {
  expect(Object.fromEntries(optionalReachability(graph(), ["apps/api"]))).toEqual({
    "root@1.0.0(peer@2.0.0)": false,
    "optional@1.0.0": true,
    "shared@1.0.0": false,
    "leaf@1.0.0": true,
  });
});

function apiWithOptional() {
  return lockText({
    importers: {
      ".": {
        dependencies: { root: { specifier: "1.0.0", version: "1.0.0" } },
        devDependencies: { typescript: { specifier: "6.0.3", version: "6.0.3" } },
      },
    },
    packages: {
      "root@1.0.0": {},
      "leaf@1.0.0": {},
      "typescript@6.0.3": { resolution: { integrity: "ts-fixture" } },
    },
    snapshots: {
      "root@1.0.0": { optionalDependencies: { leaf: "1.0.0" } },
      "leaf@1.0.0": {},
      "typescript@6.0.3": {},
    },
  });
}
it("API 전용 optional은 실제 도달성으로 정하고 frozen 뒤 플래그 변조를 거절한다", () => {
  const api = apiWithOptional(),
    front = lockText({ importers: { "apps/web": {} } });
  const merged = mergeApiLock(front, api, { typescriptPin: "6.0.3" });
  expect(dependency(merged).snapshots["leaf@1.0.0"]).toEqual({ optional: true });
  expect(dependency(merged).snapshots["root@1.0.0"]).toEqual({
    optionalDependencies: { leaf: "1.0.0" },
  });
  expect(() => {
    verifyAppResolutions(
      [
        { app: "api", source: api },
        { app: "web", source: front },
      ],
      merged,
      { typescriptPin: "6.0.3" },
    );
  }).not.toThrow();
  expect(() => {
    verifyAppResolutions(
      [
        { app: "api", source: api },
        { app: "web", source: front },
      ],
      merged.replace("optional: true", "optional: false"),
      { typescriptPin: "6.0.3" },
    );
  }).toThrow(/해석/);
});
it("API TypeScript 지정자와 해석이 pin일 때만 override 메타데이터 추가를 허용한다", () => {
  const api = apiWithOptional().replace("overrides:\n  typescript: 6.0.3\n", "");
  const front = lockText({ importers: { "apps/web": {} } });
  expect(() => mergeApiLock(front, api, { typescriptPin: "6.0.3" })).not.toThrow();
  expect(() =>
    mergeApiLock(front, api.replace("specifier: 6.0.3", "specifier: ^6.0.3"), {
      typescriptPin: "6.0.3",
    }),
  ).toThrow(/TypeScript override/);
  expect(() =>
    mergeApiLock(front, api.replace("version: 6.0.3", "version: 6.0.2"), {
      typescriptPin: "6.0.3",
    }),
  ).toThrow(/TypeScript override/);
});
it("TypeScript override 외의 새 잠금 메타데이터도 두 번째 변화로 거절한다", () => {
  const api = apiWithOptional();
  const front = lockText({ importers: { "apps/web": {} }, injectedPolicy: true });
  expect(() => mergeApiLock(front, api, { typescriptPin: "6.0.3" })).toThrow(/해석/);
});
it("선택 경로에서 먼저 방문한 노드도 나중의 필수 경로를 다시 전파한다", () => {
  const lock = graph();
  lock.snapshots["shared@1.0.0"] = { dependencies: { leaf: "1.0.0" } };
  expect(optionalReachability(lock, ["apps/api"]).get("leaf@1.0.0")).toBe(false);
});
it.each(["dependencies", "optionalDependencies"])(
  "workspace link는 대상 importer의 실제 의존성과 선택 경로를 따라간다: %s",
  (section) => {
    const lock = graph();
    lock.importers["contract/mock"] = {
      [section]: {
        "@contract/typespec": { specifier: "workspace:*", version: "link:../typespec" },
      },
    };
    lock.importers["contract/typespec"] = {
      devDependencies: { shared: { specifier: "1.0.0", version: "1.0.0" } },
    };
    expect(Object.fromEntries(optionalReachability(lock, ["contract/mock"]))).toEqual({
      "shared@1.0.0": section === "optionalDependencies",
    });
  },
);
it("없는 workspace importer를 link로 참조하면 실패한다", () => {
  const lock = graph();
  lock.importers["contract/mock"] = { dependencies: { contract: { version: "link:../missing" } } };
  expect(() => optionalReachability(lock, ["contract/mock"])).toThrow(/그래프/);
});
it.each(["snapshot", "package", "peer", "root"])(
  "깨진 잠금 그래프를 추측해서 보완하지 않는다: %s",
  (kind) => {
    const lock = graph();
    if (kind === "snapshot") delete lock.snapshots["leaf@1.0.0"];
    if (kind === "package") delete lock.packages["shared@1.0.0"];
    if (kind === "peer")
      lock.snapshots["root@1.0.0(peer@2.0.0)"] = { dependencies: { shared: "1.0.0(peer@3.0.0)" } };
    expect(() => optionalReachability(lock, [kind === "root" ? "missing" : "apps/api"])).toThrow(
      /그래프/,
    );
  },
);
