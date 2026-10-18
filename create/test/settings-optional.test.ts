import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { mergeSettings } from "../src/harness.ts";

const settings = (app: string) =>
  JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, `../../templates/${app}/.claude/settings.json`),
      "utf8",
    ),
  ) as unknown;

it("hooks만 선언한 Nest API도 프론트 deny와 루트 보안 hook을 보존한다", () => {
  const merged = mergeSettings({
    api: settings("nestjs"),
    web: settings("nextjs"),
    admin: settings("nextjs-admin"),
  });
  for (const app of ["web", "admin"]) {
    expect(merged.permissions.deny).toContain(`Read(./apps/${app}/.env)`);
    expect(merged.permissions.deny).toContain(`Write(./apps/${app}/**/generated/**)`);
  }
  expect(merged.permissions.deny).toContain("Edit(./contract/openapi.yaml)");
  expect(merged.hooks.PreToolUse[0]?.hooks[0]?.args).toEqual([
    "${CLAUDE_PROJECT_DIR}/.claude/hooks/pre-tool-use.mjs",
  ]);
  expect(Object.keys(merged.hooks).sort()).toEqual([
    "PostToolUse",
    "PreToolUse",
    "SessionStart",
    "Stop",
  ]);
});

it("선택 권한 목록은 빈 합집합으로 취급하고 명시한 deny는 유지한다", () => {
  const merged = mergeSettings({ api: { permissions: { deny: ["Read(./private/**)"] } }, web: {} });
  expect(merged.permissions.deny).toEqual(["Read(./apps/api/private/**)"]);
  expect(merged.permissions.allow).toContain("Bash(pnpm check *)");
});

it.each(
  [null, [], "allow", { allow: null }, { deny: "Read(./.env)" }, { allow: [42] }].map(
    (permissions) => [permissions],
  ),
)("잘못 선언한 권한은 앱 이름과 수정 안내로 거절한다: %j", (permissions) => {
  expect(() => mergeSettings({ api: { permissions } })).toThrow(/api.*권한.* — /);
});
