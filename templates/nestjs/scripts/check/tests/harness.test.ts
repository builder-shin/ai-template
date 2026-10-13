import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { harnessProblems } from "../harness.js";

let root: string;
function write(path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-check-harness-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  write("AGENTS.md", "# 규칙\n");
  write("CLAUDE.md", "@AGENTS.md\n");
  write(".env.example", readFileSync(new URL("../../../.env.example", import.meta.url), "utf8"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
it("401줄 소스를 거절한다", () => {
  write("src/a.ts", "export {};\n".repeat(401));
  expect(harnessProblems(root)).toContain("src/a.ts: 401줄 — 소스는 400줄 이하로 나눈다");
});
it("601줄 시험을 거절한다", () => {
  write("scripts/check/tests/a.test.ts", "export {};\n".repeat(601));
  expect(harnessProblems(root)).toContain(
    "scripts/check/tests/a.test.ts: 601줄 — 시험은 600줄 이하로 나눈다",
  );
});
it("400줄 소스와 600줄 시험은 허용한다", () => {
  write("src/a.ts", "export {};\r\n".repeat(400));
  write("src/tests/a.test.ts", "export {};\n".repeat(600));
  expect(harnessProblems(root)).toEqual([]);
});
it("지정된 생성물만 크기와 억제 주석 검사에서 제외한다", () => {
  for (const path of ["src/generated/x.ts", "openapi.json", "prisma/migrations/처음/migration.sql"])
    write(path, "// eslint-disable\n".repeat(1000));
  expect(harnessProblems(root)).toEqual([]);
  write("scripts/generated/a.ts", "export {};\n".repeat(401));
  expect(harnessProblems(root)).toContain(
    "scripts/generated/a.ts: 401줄 — 소스는 400줄 이하로 나눈다",
  );
});
it("사유 없는 억제 주석의 위치를 알린다", () => {
  write("src/b.ts", "export {};\n\n// eslint-disable-next-line no-console\nconsole.log(1);\n");
  expect(harnessProblems(root)).toContain(
    'src/b.ts:3 억제 주석에 사유가 없다 — "-- 사유"를 같은 줄에 적는다',
  );
});
it("인라인 disable과 ts-expect-error도 계속 검사한다", () => {
  write(
    "src/b.ts",
    "export {}; // eslint-disable-line\n// @ts-expect-error\nconst x: number = 'x';\n",
  );
  expect(harnessProblems(root).filter((problem) => problem.includes("억제 주석"))).toHaveLength(2);
});
it("문자열과 정규식 속 억제 문구를 주석으로 오인하지 않는다", () => {
  write(
    "src/b.ts",
    'export const text = "// eslint-disable";\nexport const pattern = /eslint-disable/;\n',
  );
  expect(harnessProblems(root)).toEqual([]);
});
it("같은 줄에 구체 사유가 있는 주석은 허용한다", () => {
  write(
    "src/b.ts",
    "export {}; // eslint-disable-line -- 테스트 입력이다\n// @ts-expect-error -- 타입 오류를 검증한다\nconst x: number = 'x';\n",
  );
  expect(harnessProblems(root)).toEqual([]);
});
it("빈 사유와 다음 줄에 쓴 사유는 거절한다", () => {
  write("src/b.ts", "// eslint-disable --\n// @ts-expect-error\n// -- 다음 줄의 사유다\n");
  expect(harnessProblems(root).filter((problem) => problem.includes("억제 주석"))).toHaveLength(2);
});
it("환경 예시와 설정 키를 대조한다", () => {
  write(".env.example", "UNKNOWN=\n");
  const problems = harnessProblems(root);
  expect(problems).toContain(".env.example:1 UNKNOWN — 설정 스키마에 없는 키다");
  expect(problems).toContain(".env.example — 설정 키 PORT가 없다");
});
it("추적된 Prisma 생성물을 거절한다", () => {
  write("src/generated/client.ts", "export {};\n");
  execFileSync("git", ["add", "src/generated/client.ts"], { cwd: root });
  expect(harnessProblems(root)).toContain(
    "src/generated/client.ts — 생성물은 git에서 추적하지 않는다",
  );
});
it("중첩 지침의 짝과 CLAUDE import를 검사한다", () => {
  write("src/AGENTS.md", "# 소스 규칙\n");
  expect(harnessProblems(root)).toContain("src/AGENTS.md — 같은 폴더에 CLAUDE.md를 둔다");
  write("src/CLAUDE.md", "# 별도 규칙\n");
  expect(harnessProblems(root)).toContain("src/CLAUDE.md — @AGENTS.md 한 줄만 적는다");
  write("src/CLAUDE.md", "@AGENTS.md\n");
  expect(harnessProblems(root)).toEqual([]);
});
it("CLAUDE만 있는 폴더도 거절한다", () => {
  write("src/CLAUDE.md", "@AGENTS.md\n");
  expect(harnessProblems(root)).toContain("src/CLAUDE.md — 같은 폴더에 AGENTS.md를 둔다");
});
it("루트 CLAUDE의 import 뒤 추가 안내는 허용하고 중첩 지침은 한 줄로 유지한다", () => {
  write("CLAUDE.md", "@AGENTS.md\n\nClaude 전용 안내다.\n");
  expect(harnessProblems(root)).toEqual([]);
  write("src/AGENTS.md", "# 규칙\n");
  write("src/CLAUDE.md", "@AGENTS.md\n\n중복 안내다.\n");
  expect(harnessProblems(root)).toContain("src/CLAUDE.md — @AGENTS.md 한 줄만 적는다");
});
it("설치물과 캐시를 열지 않는다", () => {
  write("node_modules/pkg/index.ts", "export {};\n".repeat(1000));
  write(".cache/input.ts", "export {};\n".repeat(1000));
  expect(harnessProblems(root)).toEqual([]);
});
it("루트 지침이 없으면 생성 프로젝트의 규칙을 요구한다", () => {
  rmSync(join(root, "AGENTS.md"));
  rmSync(join(root, "CLAUDE.md"));
  expect(harnessProblems(root)).toContain("AGENTS.md — 프로젝트 루트에 지침을 둔다");
});
it("루트 지침은 200줄 이하로 유지한다", () => {
  write("AGENTS.md", "규칙\n".repeat(201));
  expect(harnessProblems(root)).toContain("AGENTS.md: 201줄 — 루트 지침은 200줄 이하로 나눈다");
  write("AGENTS.md", "규칙\n".repeat(200));
  expect(harnessProblems(root)).toEqual([]);
});
const negativeFixture = "scripts/lint/fixtures/negative/ban-ts-comment/src/service.ts";
it("의도한 음성 fixture의 첫 독립 ts-expect-error 주석만 허용한다", () => {
  write(negativeFixture, "// @ts-expect-error\nexport const count: number = '오류';\n");
  expect(harnessProblems(root)).toEqual([]);
});
it.each([
  "scripts/lint/fixtures/negative/ban-ts-comment/src/adjacent.ts",
  "scripts/lint/fixtures/positive/src/service.ts",
  "src/modules/posts/service.ts",
])("음성 fixture 예외를 다른 경로에 적용하지 않는다: %s", (path) => {
  write(path, "// @ts-expect-error\nexport const count: number = '오류';\n");
  expect(harnessProblems(root)).toContain(
    `${path}:1 억제 주석에 사유가 없다 — "-- 사유"를 같은 줄에 적는다`,
  );
});
it("정확한 음성 fixture에도 600줄 한도를 적용한다", () => {
  write(negativeFixture, "// @ts-expect-error\n" + "export {};\n".repeat(600));
  expect(harnessProblems(root)).toContain(`${negativeFixture}: 601줄 — 시험은 600줄 이하로 나눈다`);
});
it("정확한 음성 fixture의 사유 없는 eslint-disable도 거절한다", () => {
  write(negativeFixture, "// @ts-expect-error\n// eslint-disable\nexport {};\n");
  expect(harnessProblems(root)).toContain(
    `${negativeFixture}:2 억제 주석에 사유가 없다 — "-- 사유"를 같은 줄에 적는다`,
  );
});
it("정확한 음성 fixture에서도 뒤 주석과 인라인 주석을 거절한다", () => {
  write(
    negativeFixture,
    "// @ts-expect-error\nexport {}; // @ts-expect-error\n// @ts-expect-error\n",
  );
  expect(harnessProblems(root).filter((problem) => problem.includes("억제 주석"))).toHaveLength(2);
});
