import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { gitEnvironment } from "../git-environment.js";

const templateCheck = join(process.cwd(), "scripts/check");
const actualEntry = join(templateCheck, "harness.ts");
const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-check-entry-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root, env: gitEnvironment() });
  writeFileSync(join(root, "AGENTS.md"), "# 규칙\n");
  writeFileSync(join(root, "CLAUDE.md"), "@AGENTS.md\n");
  writeFileSync(
    join(root, ".env.example"),
    readFileSync(new URL("../../../.env.example", import.meta.url), "utf8"),
  );
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/bad.ts"), "export {};\n".repeat(401));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  expect(existsSync(root)).toBe(false);
  expect(existsSync(templateCheck)).toBe(true);
});
function runEntry(path: string) {
  return spawnSync(process.execPath, ["--import", loader, path], {
    cwd: root,
    encoding: "utf8",
    env: gitEnvironment(),
  });
}
it("실제 하네스 직접 진입은 잘못된 프로젝트를 종료 코드 1로 거절한다", () => {
  const result = runEntry(actualEntry);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("src/bad.ts: 401줄 — 소스는 400줄 이하로 나눈다");
});
it("디렉터리 링크로 진입해도 실제 하네스 검사를 실행한다", () => {
  const link = join(root, "linked-check");
  symlinkSync(templateCheck, link, process.platform === "win32" ? "junction" : "dir");
  const result = runEntry(join(link, "harness.ts"));
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("src/bad.ts: 401줄 — 소스는 400줄 이하로 나눈다");
});
it("라이브러리 import만으로 하네스를 실행하지 않는다", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      loader,
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(pathToFileURL(actualEntry).href)}); process.stdout.write('가져왔다\\n');`,
    ],
    { cwd: root, encoding: "utf8", env: gitEnvironment() },
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("가져왔다\n");
  expect(result.stderr).toBe("");
});
