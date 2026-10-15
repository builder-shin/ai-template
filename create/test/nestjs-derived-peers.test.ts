import { expect, it } from "vitest";
import {
  alignDerivedTypeScriptPeers,
  mergeApiLock,
  verifyAppResolutions,
} from "../src/lockfile.ts";
import { dependency, lockText } from "./lock-fixture.ts";

const record = {
  resolution: { integrity: "shared" },
  engines: { node: ">=18" },
  peerDependencies: { typescript: ">=4.8.4 <6.1.0", eslint: "^10" },
  peerDependenciesMeta: { typescript: { optional: true } },
};
const api = () =>
  lockText({
    importers: { ".": {} },
    packages: { "shared@1.0.0": record },
    snapshots: { "shared@1.0.0": {} },
  });
const front = (value: Record<string, unknown>) =>
  lockText({
    importers: { "apps/web": {} },
    packages: { "shared@1.0.0": value },
    snapshots: { "shared@1.0.0": {} },
  });
const aligned = {
  ...record,
  peerDependencies: { ...record.peerDependencies, typescript: "6.0.3" },
};
it("기존 문자열 TypeScript peer만 메모리에서 정렬하고 원본 문자열을 보존한다", () => {
  const before = api();
  expect(dependency(alignDerivedTypeScriptPeers(before, "6.0.3")).packages["shared@1.0.0"]).toEqual(
    aligned,
  );
  expect(dependency(before).packages["shared@1.0.0"]).toEqual(record);
  expect(() => mergeApiLock(front(aligned), before, { typescriptPin: "6.0.3" })).not.toThrow();
});
it.each([
  ["무결성", { ...aligned, resolution: { integrity: "changed" } }],
  ["다른 peer", { ...aligned, peerDependencies: { ...aligned.peerDependencies, eslint: "^11" } }],
  ["엔진", { ...aligned, engines: { node: ">=24" } }],
  ["peer 메타", { ...aligned, peerDependenciesMeta: {} }],
  ["peer 추가", { ...aligned, peerDependencies: { ...aligned.peerDependencies, extra: "1" } }],
  ["peer 삭제", { ...aligned, peerDependencies: { typescript: "6.0.3" } }],
] as const)("TypeScript 외 두 번째 변화는 병합·검증 모두 거절한다: %s", (_name, changed) => {
  expect(() => mergeApiLock(front(changed), api(), { typescriptPin: "6.0.3" })).toThrow(/해석/);
  expect(() => {
    verifyAppResolutions([{ app: "api", source: api() }], front(changed), {
      typescriptPin: "6.0.3",
    });
  }).toThrow(/해석/);
});
it("TypeScript peer가 없던 레코드에 새 peer를 추가하지 않는다", () => {
  const before = lockText({
    importers: { ".": {} },
    packages: { "shared@1.0.0": { resolution: record.resolution } },
    snapshots: {},
  });
  expect(dependency(alignDerivedTypeScriptPeers(before, "6.0.3")).packages["shared@1.0.0"]).toEqual(
    { resolution: record.resolution },
  );
  expect(() => mergeApiLock(front(aligned), before, { typescriptPin: "6.0.3" })).toThrow(/해석/);
});
