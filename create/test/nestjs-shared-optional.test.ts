import { expect, it } from "vitest";
import { mergeApiLock, mergeFrontendLocks, verifyAppResolutions } from "../src/lockfile.ts";
import { dependency, lockText, requiredFixture } from "./lock-fixture.ts";
import type { LockDocument } from "../src/lock-graph.ts";

function sources(change?: (api: LockDocument, front: LockDocument) => void) {
  const common = {
    packages: {
      "shared@1.0.0": { resolution: { integrity: "shared" } },
      "leaf@1.0.0": { resolution: { integrity: "leaf" } },
    },
    snapshots: { "shared@1.0.0": { dependencies: { leaf: "1.0.0" } }, "leaf@1.0.0": {} },
  };
  const api = dependency(
    lockText({
      ...common,
      importers: {
        ".": { optionalDependencies: { shared: { specifier: "1.0.0", version: "1.0.0" } } },
      },
    }),
  );
  requiredFixture(api.snapshots["shared@1.0.0"]).optional = true;
  const front = dependency(
    lockText({
      ...common,
      importers: { ".": { dependencies: { shared: { specifier: "1.0.0", version: "1.0.0" } } } },
    }),
  );
  change?.(api, front);
  const apiText = lockText(api),
    frontText = lockText(front);
  return {
    api: apiText,
    front: frontText,
    resolved: mergeFrontendLocks([{ app: "web", source: frontText }]),
  };
}

it("공유 API optional true만 필수 경로 증명 뒤 정렬하고 프론트 원본 전체를 보존한다", () => {
  const input = sources(),
    originals = { ...input };
  const merged = mergeApiLock(input.resolved, input.api, { typescriptPin: "6.0.3" });
  expect(dependency(merged).snapshots).toEqual(dependency(input.front).snapshots);
  expect(dependency(merged).packages).toEqual(dependency(input.front).packages);
  expect(dependency(merged).importers["apps/web"]).toEqual(dependency(input.front).importers["."]);
  expect(() => {
    verifyAppResolutions(
      [
        { app: "api", source: input.api },
        { app: "web", source: input.front },
      ],
      merged,
      { typescriptPin: "6.0.3" },
    );
  }).not.toThrow();
  expect(input).toEqual(originals);
  expect(dependency(input.api).snapshots["shared@1.0.0"]).toEqual({
    dependencies: { leaf: "1.0.0" },
    optional: true,
  });
  expect(() => {
    verifyAppResolutions(
      [
        { app: "api", source: input.api },
        { app: "web", source: input.front },
      ],
      merged.replace("leaf: 1.0.0", "leaf: 1.1.0"),
      { typescriptPin: "6.0.3" },
    );
  }).toThrow(/그래프/);
});

it.each([
  "선택 경로만",
  "도달 불가",
  "API false",
  "역방향",
  "프론트 false",
  "다른 필드",
  "의존 간선",
  "peer 간선",
  "무결성",
  "API 그래프 누락",
  "API importer 누락",
  "프론트 그래프 누락",
])("공유 optional 호환 조건 밖의 변화는 거절한다: %s", (kind) => {
  const input = sources((api, front) => {
    if (kind === "선택 경로만")
      front.importers["."] = {
        optionalDependencies: { shared: { specifier: "1.0.0", version: "1.0.0" } },
      };
    if (kind === "도달 불가") {
      api.importers["."] = {};
      front.importers["."] = {};
    }
    if (kind === "API false") requiredFixture(api.snapshots["shared@1.0.0"]).optional = false;
    if (kind === "역방향") {
      delete requiredFixture(api.snapshots["shared@1.0.0"]).optional;
      requiredFixture(front.snapshots["shared@1.0.0"]).optional = true;
    }
    if (kind === "프론트 false") requiredFixture(front.snapshots["shared@1.0.0"]).optional = false;
    if (kind === "다른 필드")
      requiredFixture(api.snapshots["shared@1.0.0"]).transitivePeerDependencies = ["changed"];
    if (kind === "의존 간선") {
      requiredFixture(api.snapshots["shared@1.0.0"]).dependencies = { leaf: "1.1.0" };
      api.packages["leaf@1.1.0"] = {};
      api.snapshots["leaf@1.1.0"] = {};
    }
    if (kind === "peer 간선") {
      for (const lock of [api, front]) {
        lock.snapshots["leaf@1.0.0(peer@2.0.0)"] = {};
        lock.snapshots["leaf@1.0.0(peer@3.0.0)"] = {};
      }
      requiredFixture(api.snapshots["shared@1.0.0"]).dependencies = { leaf: "1.0.0(peer@2.0.0)" };
      requiredFixture(front.snapshots["shared@1.0.0"]).dependencies = { leaf: "1.0.0(peer@3.0.0)" };
    }
    if (kind === "무결성")
      requiredFixture(api.packages["shared@1.0.0"]).resolution = { integrity: "changed" };
    if (kind === "API 그래프 누락") delete api.snapshots["leaf@1.0.0"];
    if (kind === "API importer 누락") delete api.importers["."];
    if (kind === "프론트 그래프 누락") delete front.snapshots["leaf@1.0.0"];
  });
  expect(() => mergeApiLock(input.resolved, input.api, { typescriptPin: "6.0.3" })).toThrow(
    kind === "API 그래프 누락" || kind === "프론트 그래프 누락" ? /그래프/ : /해석/,
  );
});
