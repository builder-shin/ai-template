import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { format } from "./format.mjs";
import { exitCode, isMain, run } from "./process.mjs";

export function instructionErrors(root) {
  const errors = [];
  function visit(folder) {
    const entries = readdirSync(folder, { withFileTypes: true });
    for (const name of ["AGENTS.md", "CLAUDE.md"]) {
      if (!entries.some((entry) => entry.isFile() && entry.name === name)) continue;
      const other = name === "AGENTS.md" ? "CLAUDE.md" : "AGENTS.md";
      if (!existsSync(join(folder, other)))
        errors.push(`${relative(root, join(folder, name))}:1 지침 짝 — ${other}를 추가한다.`);
    }
    const claude = join(folder, "CLAUDE.md");
    if (existsSync(claude) && readFileSync(claude, "utf8").trim() !== "@AGENTS.md")
      errors.push(`${relative(root, claude)}:1 지침 import — @AGENTS.md 한 줄로 저장한다.`);
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        ![
          "node_modules",
          ".git",
          ".venv",
          ".next",
          ".cache",
          ".turbo",
          "__pycache__",
          ".pytest_cache",
          ".ruff_cache",
        ].includes(entry.name)
      )
        visit(join(folder, entry.name));
    }
  }
  visit(root);
  const agents = join(root, "AGENTS.md");
  if (!existsSync(agents)) errors.push("AGENTS.md:1 지침 — 루트 지침을 추가한다.");
  else if (readFileSync(agents, "utf8").trimEnd().split(/\r?\n/).length > 200)
    errors.push("AGENTS.md:1 지침 길이 — 200줄 이하로 줄인다.");
  return errors;
}

export function check(root, { run: execute = run, output = console.log } = {}) {
  const steps = [
    () => format(root, false, execute),
    () => execute(process.execPath, ["--test", "scripts/*.test.mjs"], { cwd: root }),
    () => {
      const errors = instructionErrors(root);
      return { status: errors.length ? 1 : 0, stdout: errors.join("\n") };
    },
    () =>
      execute(
        "pnpm",
        ["exec", "turbo", "run", "check", "--filter=api", "--filter=web", "--concurrency=1"],
        { cwd: root },
      ),
  ];
  for (const step of steps) {
    const result = step();
    if (exitCode(result) !== 0) {
      output(
        [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n").trim() ||
          "검사를 실행할 수 없다 — pnpm setup으로 도구를 준비한다.",
      );
      return exitCode(result);
    }
  }
  output(`check 통과: ${steps.length}단계`);
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = check(resolve(import.meta.dirname, ".."));
