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
  expect(settings.permissions.deny).not.toContain("Edit(./contract/**)");
  expect(settings.permissions.deny).not.toContain("Write(./contract/**)");
  expect(settings.permissions.deny).toContain("Edit(./src/lib/api/schema.d.ts)");
  expect(settings.permissions.deny).toContain("Write(./src/lib/api/schema.d.ts)");
});

it("독립 프로젝트의 계약·목 소스는 편집할 수 있고 생성물은 보호한다", () => {
  const settings = JSON.parse(readFileSync(".claude/settings.json", "utf8"));
  const denied = (tool: string, path: string) =>
    settings.permissions.deny.some((rule: string) => {
      if (!rule.startsWith(`${tool}(`)) return false;
      const glob = rule.slice(tool.length + 1, -1);
      const pattern = glob
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, ".*")
        .replace(/(?<!\.)\*/g, "[^/]*");
      return new RegExp(`^${pattern}$`).test(`./${path}`);
    });
  for (const tool of ["Edit", "Write"]) {
    for (const path of [
      "contract/typespec/src/main.tsp",
      "contract/mock/src/routes/auth.ts",
      "contract/mock/src/routes/auth.test.ts",
    ])
      expect(denied(tool, path), `${tool}: ${path}`).toBe(false);
    for (const path of [
      "contract/openapi.yaml",
      "contract/mock/src/generated/api.ts",
      "src/lib/api/schema.d.ts",
      "src/lib/generated/error-codes.ts",
    ])
      expect(denied(tool, path), `${tool}: ${path}`).toBe(true);
  }
});

it("강제 push의 명시적 옵션만 권한으로 막고 일반 긴 옵션은 허용한다", () => {
  const settings = JSON.parse(readFileSync(".claude/settings.json", "utf8"));
  for (const tool of ["Bash", "PowerShell"]) {
    const denied = (command: string) =>
      settings.permissions.deny.some((rule: string) => {
        if (!rule.startsWith(`${tool}(`)) return false;
        const pattern = rule
          .slice(tool.length + 1, -1)
          .split("*")
          .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*");
        return new RegExp(`^${pattern}$`).test(command);
      });
    for (const command of [
      "git push -f origin main",
      "git push --force origin main",
      "git push --force-with-lease origin main",
    ])
      expect(denied(command), `${tool}: ${command}`).toBe(true);
    for (const command of [
      "git push --follow-tags origin main",
      "git push --prune --follow-tags origin main",
      "git push --no-follow-tags origin main",
      "git push origin main",
    ])
      expect(denied(command), `${tool}: ${command}`).toBe(false);
  }
});
