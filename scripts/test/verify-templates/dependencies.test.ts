import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { verifyFrontendDependencies } from "../../src/verify-templates/dependencies.ts";

const repos: string[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
});
function fixture(web: unknown, admin: unknown) {
  const root = mkdtempSync(join(tmpdir(), "aitpl-dependency-versions-"));
  repos.push(root);
  for (const [name, pkg] of [
    ["nextjs", web],
    ["nextjs-admin", admin],
  ] as const) {
    const dir = join(root, "templates", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  }
  return root;
}

it("두 프론트의 공통 의존성 버전이 같으면 통과한다", () => {
  expect(
    verifyFrontendDependencies(
      fixture(
        {
          dependencies: { next: "16.3.8", extra: "1.0.0" },
          devDependencies: { vitest: "5.0.1" },
          pnpm: { overrides: { typescript: "6.0.3" } },
        },
        {
          dependencies: { next: "16.3.8" },
          devDependencies: { vitest: "5.0.1" },
          pnpm: { overrides: { typescript: "6.0.3" } },
        },
      ),
    ),
  ).toEqual([]);
});

it.each(["dependencies", "devDependencies", "overrides"])(
  "%s의 차이에 두 버전과 수정 방법을 알린다",
  (section) => {
    const web =
      section === "overrides"
        ? { pnpm: { overrides: { typescript: "6.0.3" } } }
        : { [section]: { typescript: "6.0.3" } };
    const admin =
      section === "overrides"
        ? { pnpm: { overrides: { typescript: "6.0.4" } } }
        : { [section]: { typescript: "6.0.4" } };
    const problems = verifyFrontendDependencies(fixture(web, admin));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("6.0.3");
    expect(problems[0]).toContain("6.0.4");
    expect(problems[0]).toMatch(/typescript.*—.*같은 버전/);
  },
);

it("의존성 구역이 달라도 같은 패키지는 같은 버전이어야 한다", () => {
  expect(
    verifyFrontendDependencies(
      fixture({ dependencies: { next: "16.3.8" } }, { devDependencies: { next: "16.3.9" } }),
    ),
  ).toHaveLength(1);
});

it("두 앱의 같은 override가 원래 선언 버전과 달라도 허용한다", () => {
  const pkg = { dependencies: { package: "1.0.0" }, overrides: { package: "1.0.1" } };
  expect(verifyFrontendDependencies(fixture(pkg, pkg))).toEqual([]);
});
