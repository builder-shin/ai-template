import { expect, it } from "vitest";
import { readFileSync } from "node:fs";

it("네 hook이 node exec form이고 권한은 예시 파일을 막지 않는다", () => {
  const settings = JSON.parse(readFileSync(".claude/settings.json", "utf8"));
  for (const name of ["PreToolUse", "PostToolUse", "Stop", "SessionStart"]) {
    expect(settings.hooks[name][0].hooks[0]).toMatchObject({ type: "command", command: "node" });
    expect(settings.hooks[name][0].hooks[0].args[0]).toMatch(
      /^\$\{CLAUDE_PROJECT_DIR\}\/\.claude\/hooks\/.+\.mjs$/,
    );
  }
  expect(settings.permissions.deny).toContain("Read(./.env)");
  expect(settings.permissions.deny).not.toContain("Read(./.env*)");
  expect(settings.permissions.deny).not.toContain("Read(./.env.example)");
  expect(settings.permissions.deny).toContain("Edit(./**/generated/**)");
  expect(settings.permissions.deny).toContain("Write(./**/generated/**)");
  expect(settings.permissions.deny).toContain("Edit(./contract/**)");
  expect(settings.permissions.deny).toContain("Write(./contract/**)");
  expect(settings.permissions.deny).toContain("Edit(./src/lib/api/schema.d.ts)");
  expect(settings.permissions.deny).toContain("Write(./src/lib/api/schema.d.ts)");
});
