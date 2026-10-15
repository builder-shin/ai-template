import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { harnessProblems } from "../harness.js";
import { gitEnvironment } from "../git-environment.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-harness-final-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root, env: gitEnvironment() });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
it("아직 없는 필수 명령을 하네스 오류로 알린다", () => {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ scripts: { "gen:module": "node scripts/not-yet.mjs gen:module 21" } }),
  );
  expect(harnessProblems(root)).toContain("package.json: 아직 없는 명령 gen:module이 남았다");
});
it("eslint-plugin-import 사용을 거절하고 resolver 설정은 허용한다", () => {
  writeFileSync(join(root, "eslint.config.js"), 'import plugin from "eslint-plugin-import";\n');
  expect(harnessProblems(root)).toContain(
    "eslint.config.js: eslint-plugin-import 대신 boundaries와 프로젝트 규칙을 쓴다",
  );
  writeFileSync(
    join(root, "eslint.config.js"),
    'export default { settings: { "import/resolver": "typescript" } };\n',
  );
  expect(harnessProblems(root).some((problem) => problem.includes("eslint-plugin-import"))).toBe(
    false,
  );
});
