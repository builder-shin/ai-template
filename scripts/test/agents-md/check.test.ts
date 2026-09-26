import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkAgentsMd } from "../../src/agents-md/check.ts";

/** { "상대 경로": "내용" }으로 임시 폴더를 만든다. */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "agents-md-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const paths = (root: string) => checkAgentsMd(root).map((problem) => problem.path);

describe("checkAgentsMd", () => {
  it("짝이 맞으면 통과한다. 루트 CLAUDE.md는 import 뒤에 내용을 더할 수 있다", () => {
    const root = tree({
      "AGENTS.md": "# 규칙\n",
      "CLAUDE.md": "@AGENTS.md\n\n## Claude 전용\n- hook이 check를 돌린다\n",
      "src/modules/AGENTS.md": "# 모듈 규칙\n",
      "src/modules/CLAUDE.md": "@AGENTS.md\n",
    });
    expect(checkAgentsMd(root)).toEqual([]);
  });

  it("AGENTS.md 옆에 CLAUDE.md가 없으면 잡는다", () => {
    const root = tree({ "AGENTS.md": "a", "CLAUDE.md": "@AGENTS.md", "db/AGENTS.md": "b" });
    expect(paths(root)).toEqual(["db/CLAUDE.md"]);
  });

  it("하위 폴더 CLAUDE.md에 다른 내용이 있으면 잡는다", () => {
    const root = tree({ "db/AGENTS.md": "b", "db/CLAUDE.md": "@AGENTS.md\n마이그레이션 규칙" });
    expect(checkAgentsMd(root)[0]?.message).toMatch(/한 줄만 담는다/);
  });

  it("첫 줄이 import가 아니면 잡는다", () => {
    const root = tree({ "AGENTS.md": "a", "CLAUDE.md": "# 규칙\n@AGENTS.md" });
    expect(checkAgentsMd(root)[0]?.message).toMatch(/첫 줄은 "@AGENTS.md"/);
  });

  it("AGENTS.md 없이 CLAUDE.md만 있으면 잡는다", () => {
    const root = tree({ "lib/CLAUDE.md": "직접 쓴 규칙" });
    expect(paths(root)).toEqual(["lib/CLAUDE.md"]);
  });

  it("루트 AGENTS.md가 200줄을 넘으면 잡는다", () => {
    const root = tree({ "AGENTS.md": "줄\n".repeat(201), "CLAUDE.md": "@AGENTS.md" });
    expect(paths(root)).toEqual(["AGENTS.md"]);
  });

  it("fixtures와 제외한 루트 폴더는 보지 않는다", () => {
    const root = tree({
      "test/fixtures/bad/AGENTS.md": "x",
      "templates/web/AGENTS.md": "x",
    });
    expect(checkAgentsMd(root, { exclude: ["templates"] })).toEqual([]);
  });
});
