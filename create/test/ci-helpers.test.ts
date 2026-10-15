import { expect, it } from "vitest";
import { importerResolutionDiff } from "./ci/resolution-drift.mjs";
import { hoistShadows } from "./ci/hoist-audit.mjs";

const before = `---
importers: {.: {packageManagerDependencies: {pnpm: 12.6.0}}}
---
importers:
  apps/api: {dependencies: {nodemailer: {specifier: 10.0.0, version: 10.0.0}}}
  apps/web:
    dependencies:
      react: {specifier: ^19.0.0, version: 19.3.0}
    devDependencies:
      tool: {specifier: 1.0.0, version: 1.0.0(peer@2.0.0)}
  apps/admin: {dependencies: {removed: {specifier: 1.0.0, version: 1.0.0}}}
`;
it("R1 보고서는 프론트 importer의 실제 해석 변화·추가·삭제만 기록한다", () => {
  const after = before
    .replace("version: 10.0.0", "version: 10.1.0")
    .replace("specifier: ^19.0.0", "specifier: 19.3.0")
    .replace("version: 1.0.0(peer@2.0.0)", "version: 1.0.0(peer@3.0.0)")
    .replace(
      "removed: {specifier: 1.0.0, version: 1.0.0}",
      "added: {specifier: 2.0.0, version: 2.0.0}",
    );
  expect(importerResolutionDiff(before, after, ["apps/web", "apps/admin"])).toEqual([
    { importer: "apps/admin", name: "added", before: "", after: "2.0.0" },
    { importer: "apps/admin", name: "removed", before: "1.0.0", after: "" },
    { importer: "apps/web", name: "tool", before: "1.0.0(peer@2.0.0)", after: "1.0.0(peer@3.0.0)" },
  ]);
  expect(importerResolutionDiff(before, before, ["apps/web", "apps/admin"])).toEqual([]);
});
it("R1 보고서는 없는 importer나 잘못된 잠금을 조용히 빈 보고서로 만들지 않는다", () => {
  expect(() => importerResolutionDiff(before, before, ["apps/missing"])).toThrow(/importer/);
  expect(() => importerResolutionDiff("[", before, ["apps/web"])).toThrow();
});
it("R2 감사는 숨은 hoist의 버전 그림자와 API 전용 이름을 나눠 보고한다", () => {
  const standalone = `hoistedDependencies:
  '@scope/shared@1.0.0': {'@scope/shared': private}
  'same@2.0.0(peer@1.0.0)': {same: private}
  'visible@1.0.0': {visible: public}
`;
  const combo = `hoistedDependencies:
  '@scope/shared@1.1.0': {'@scope/shared': private}
  'same@2.0.0(peer@1.0.0)': {same: private}
  'api-only@3.0.0': {api-only: private}
  'visible@2.0.0': {visible: public}
`;
  expect(hoistShadows(combo, standalone)).toEqual({
    shadowed: [{ name: "@scope/shared", combo: "1.1.0", standalone: "1.0.0" }],
    apiOnly: ["api-only"],
  });
  expect(hoistShadows(standalone, standalone)).toEqual({ shadowed: [], apiOnly: [] });
});
it("R2 감사는 사라진 기준 이름과 중복 숨은 이름도 검출한다", () => {
  expect(
    hoistShadows("hoistedDependencies: {}", "hoistedDependencies: {'pkg@1.0.0': {pkg: private}}")
      .shadowed,
  ).toEqual([{ name: "pkg", combo: "", standalone: "1.0.0" }]);
  expect(() =>
    hoistShadows(
      "hoistedDependencies: {'pkg@1.0.0': {pkg: private}, 'pkg@2.0.0': {pkg: private}}",
      "hoistedDependencies: {}",
    ),
  ).toThrow(/hoist/);
});
