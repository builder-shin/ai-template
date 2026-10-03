import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { it, expect } from "vitest";
import { parse as yaml } from "yaml";
import { parse as toml } from "smol-toml";
import { mergeSettings, mergeLefthook, mergeBetterleaks } from "../src/harness.ts";

const template = (app: string, file: string) =>
  readFileSync(resolve(import.meta.dirname, `../../templates/${app}/${file}`), "utf8");

it("앱 경로 권한은 범위를 옮기고 명령 합집합에 루트 어휘를 더한다", () => {
  const settings = mergeSettings(
    JSON.parse(template("fastapi", ".claude/settings.json")) as Parameters<typeof mergeSettings>[0],
    JSON.parse(template("nextjs", ".claude/settings.json")) as Parameters<typeof mergeSettings>[1],
  );
  expect(settings.permissions.deny).toContain("Read(./apps/api/.env)");
  expect(settings.permissions.deny).toContain("Edit(./apps/web/src/lib/api/schema.d.ts)");
  expect(settings.permissions.allow).toContain("Read(./apps/web/.env.example)");
  for (const shell of ["Bash", "PowerShell"]) {
    expect(settings.permissions.allow).toContain(`${shell}(pnpm db:migrate *)`);
    expect(settings.permissions.allow).toContain(`${shell}(pnpm db:reset *)`);
    expect(
      settings.permissions.allow.filter((rule) => rule === `${shell}(git status *)`),
    ).toHaveLength(1);
  }
  expect(settings.permissions.deny).not.toContain("Read(./.env)");
  expect(settings.hooks.PreToolUse[0]?.matcher).toBe("Bash|PowerShell|Edit|Write|MultiEdit");
  for (const groups of Object.values(settings.hooks)) {
    expect(groups[0]?.hooks[0]).toMatchObject({ type: "command", command: "node" });
    expect(groups[0]?.hooks[0]?.args[0]).toMatch(
      /^\$\{CLAUDE_PROJECT_DIR\}\/\.claude\/hooks\/.+\.mjs$/,
    );
  }
});

it("앱 hook 작업의 옵션과 glob 범위를 보존하고 비밀 스캔은 한 번만 둔다", () => {
  const merged = yaml(
    mergeLefthook(template("fastapi", "lefthook.yml"), template("nextjs", "lefthook.yml")),
  ) as {
    "pre-commit": {
      jobs: { name: string; root?: string; glob?: string; run: string; stage_fixed?: boolean }[];
    };
    "pre-push": { jobs: { run: string }[] };
  };
  const jobs = merged["pre-commit"].jobs;
  expect(jobs.find((job) => job.name === "api-format")).toMatchObject({
    root: "apps/api/",
    glob: "apps/api/*.py",
    stage_fixed: true,
  });
  expect(jobs.find((job) => job.name === "web-lint")).toMatchObject({
    root: "apps/web/",
    glob: "apps/web/*.{ts,tsx,js,mjs}",
  });
  expect(jobs.filter((job) => job.run.includes("betterleaks"))).toHaveLength(1);
  expect(jobs.find((job) => job.name === "secrets")?.run).toContain(
    "pnpm --filter web run -s tool betterleaks",
  );
  expect(jobs.find((job) => job.name === "secrets")?.run).toContain("betterleaks git ../.. ");
  expect(merged["pre-push"].jobs).toEqual([{ name: "check", run: "pnpm check" }]);
});

it("비밀 스캔 예외를 앱 안으로 제한하며 수기 코드와 루트는 계속 검사한다", () => {
  const merged = toml(
    mergeBetterleaks(
      template("fastapi", ".betterleaks.toml"),
      template("nextjs", ".betterleaks.toml"),
    ),
  ) as { extend: { useDefault: boolean }; allowlists: { paths: string[] }[] };
  expect(merged.extend.useDefault).toBe(true);
  const ignored = (path: string) =>
    merged.allowlists.some((list) => list.paths.some((pattern) => new RegExp(pattern).test(path)));
  for (const path of [
    "apps/api/uv.lock",
    "apps/api/openapi.json",
    "apps/api/api-style/lint.mjs",
    "apps/web/contract/mock/src/server.ts",
    "apps/web/src/lib/generated/errors.ts",
    "apps/web/generated/api.ts",
    "apps/web/src/lib/api/schema.d.ts",
  ])
    expect(ignored(path)).toBe(true);
  for (const path of [
    "src/generated/secrets.ts",
    "apps/api/src/generated/secrets.py",
    "apps/web/src/features/posts/actions.ts",
    "apps/api/src/app/core/config.py",
    "apps/api/contract/source.ts",
    "apps/web/openapi.json",
  ])
    expect(ignored(path)).toBe(false);
});
