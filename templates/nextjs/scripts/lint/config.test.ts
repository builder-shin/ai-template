import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { binary } from "../process.mjs";
import { linkDependencies } from "../test/dependency-links";

it("App Router의 린트는 프로젝트와 상위 디렉터리에서 Pages 안내 없이 실행된다", () => {
  const root = mkdtempSync(join(tmpdir(), "nextjs-lint-config-"));
  const project = join(root, "web");
  try {
    mkdirSync(join(project, "scripts/lint"), { recursive: true });
    mkdirSync(join(project, "src/app"), { recursive: true });
    linkDependencies(resolve("."), project);
    cpSync("eslint.config.mjs", join(project, "eslint.config.mjs"));
    cpSync("scripts/lint/boundaries.mjs", join(project, "scripts/lint/boundaries.mjs"));
    cpSync("scripts/lint/app.mjs", join(project, "scripts/lint/app.mjs"));
    writeFileSync(join(project, "package.json"), '{"type":"module"}');
    writeFileSync(join(project, "tsconfig.json"), '{"compilerOptions":{}}');
    const file = join(project, "src/app/page.tsx");
    writeFileSync(file, "export default function Page() { return null; }");
    for (const cwd of [project, root]) {
      const result = binary("eslint", ["--no-warn-ignored", file], { cwd });
      expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
      expect(`${result.stdout}${result.stderr}`).not.toMatch(/Pages directory cannot be found/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);
