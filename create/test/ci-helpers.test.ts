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

const workspaceLocks = {
  combo: `---
importers: {.: {packageManagerDependencies: {pnpm: 12.6.0}}}
---
importers: {.: {}, apps/api: {}, apps/web: {}, apps/admin: {}}
`,
  standalone: `---
importers: {.: {packageManagerDependencies: {pnpm: 12.6.0}}}
---
importers: {.: {}, contract/mock: {}, contract/typespec: {}}
`,
};
const comboWorkspaceHoist = `hoistedDependencies:
  apps/admin: {admin: private}
  apps/web: {web: private}
  'same@2.0.0(peer@1.0.0)': {same: private}
  'changed@1.1.0': {changed: private}
  'api-only@3.0.0': {api-only: private}
`;
const standaloneWorkspaceHoist = `hoistedDependencies:
  contract/mock: {'@ai-template/mock': private}
  contract/typespec: {'@ai-template/typespec': private}
  'same@2.0.0(peer@1.0.0)': {same: private}
  'changed@1.0.0': {changed: private}
  'missing@1.0.0': {missing: private}
`;
it("R2 감사는 실제 잠금의 선언된 workspace 경로만 분류하고 외부 버전 차이와 누락을 유지한다", () => {
  expect(hoistShadows(comboWorkspaceHoist, standaloneWorkspaceHoist, workspaceLocks)).toEqual({
    shadowed: [
      { name: "changed", combo: "1.1.0", standalone: "1.0.0" },
      { name: "missing", combo: "", standalone: "1.0.0" },
    ],
    apiOnly: ["api-only"],
  });
});
it("R2 감사는 명시한 workspace 잠금 없이 버전 없는 키를 허용하지 않는다", () => {
  expect(() => hoistShadows(comboWorkspaceHoist, standaloneWorkspaceHoist)).toThrow(/hoist/);
});
it("R2 감사는 다른 쪽에만 선언한 workspace와 알 수 없는 버전 없는 키를 거절한다", () => {
  for (const key of ["contract/mock", "apps/unknown"]) {
    expect(() =>
      hoistShadows(
        `hoistedDependencies: {'${key}': {unknown: private}}`,
        "hoistedDependencies: {}",
        workspaceLocks,
      ),
    ).toThrow(/hoist/);
  }
});
it("R2 감사는 importer 이름과 겹치는 실제 버전 항목도 비교에서 빠뜨리지 않는다", () => {
  const locks = { combo: "importers: {'pkg@1.0.0': {}}", standalone: "importers: {}" };
  expect(
    hoistShadows(
      "hoistedDependencies: {'pkg@1.0.0': {pkg: private}}",
      "hoistedDependencies: {}",
      locks,
    ),
  ).toEqual({
    shadowed: [],
    apiOnly: ["pkg"],
  });
});
it("R2 감사는 workspace와 외부 패키지 사이의 중복 private 이름도 거절한다", () => {
  expect(() =>
    hoistShadows(
      "hoistedDependencies: {apps/admin: {admin: private}, 'admin@1.0.0': {admin: private}}",
      "hoistedDependencies: {}",
      workspaceLocks,
    ),
  ).toThrow(/hoist/);
});
it.each([
  "hoistedDependencies: []",
  "hoistedDependencies: {apps/admin: null}",
  "hoistedDependencies: {apps/admin: []}",
  "hoistedDependencies: {apps/admin: {admin: 1}}",
  "hoistedDependencies: {apps/admin: {admin: hidden}}",
  "[",
])("R2 감사는 workspace 문맥에서도 잘못된 hoist 구조를 거절한다: %s", (source) => {
  expect(() => hoistShadows(source, "hoistedDependencies: {}", workspaceLocks)).toThrow(/hoist/);
});
it.each(["[", "packages: {}", "importers: []", "importers: {apps/admin: null}"])(
  "R2 감사는 잘못된 workspace 잠금을 빈 importer 목록으로 취급하지 않는다: %s",
  (combo) => {
    expect(() =>
      hoistShadows(comboWorkspaceHoist, standaloneWorkspaceHoist, { ...workspaceLocks, combo }),
    ).toThrow(/잠금|importer/);
  },
);
