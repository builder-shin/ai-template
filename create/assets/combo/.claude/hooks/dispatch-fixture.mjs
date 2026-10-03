import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { dispatch } from "./dispatch.mjs";
import { gitEnvironment } from "../../scripts/process.mjs";

export function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "aitpl-hooks space-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(
    "gitconfig",
    "[user]\nname = Fixture\nemail = fixture@example.com\n[commit]\ngpgsign = false\n",
  );
  const env = {
    ...gitEnvironment(),
    GIT_CONFIG_GLOBAL: join(root, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
  };
  for (const key of Object.keys(env))
    if (/^GIT_(AUTHOR|COMMITTER)_|^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$/.test(key))
      Reflect.deleteProperty(env, key);
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  write(".gitignore", ".cache/\ngitconfig\n");
  write("README.md", "# 루트\n");
  for (const app of ["api", "web"]) {
    write(`apps/${app}/file.ts`, "export const value = 1;\n");
    const hooks = Object.fromEntries(
      ["PostToolUse", "Stop", "PreToolUse", "SessionStart"].map((event) => [
        event,
        [
          {
            matcher: event === "PreToolUse" ? "Bash|PowerShell" : undefined,
            hooks: [
              {
                type: "command",
                command: process.execPath,
                args: ["${CLAUDE_PROJECT_DIR}/.claude/fake.mjs"],
                timeout: 5,
              },
            ],
          },
        ],
      ]),
    );
    write(`apps/${app}/.claude/settings.json`, JSON.stringify({ hooks }));
    write(
      `apps/${app}/.claude/fake.mjs`,
      `
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
const raw = readFileSync(0, 'utf8');
const input = JSON.parse(raw);
mkdirSync('.cache', { recursive: true });
appendFileSync(join('.cache', 'calls'), JSON.stringify({ raw, cwd: process.cwd(), project: process.env.CLAUDE_PROJECT_DIR, npmEntry: process.env.npm_execpath }) + '\\n');
const result = input.results?.${app} ?? {};
if (result.json) console.log(JSON.stringify(result.json));
if (result.text) console.log(result.text);
if (result.stderr) console.error(result.stderr);
process.exitCode = result.code ?? 0;
`,
    );
  }
  git("init", "-b", "main");
  git("add", ".");
  git("-c", "commit.gpgsign=false", "commit", "-m", "chore: fixture");
  const calls = (app) => {
    try {
      return readFileSync(join(root, `apps/${app}/.cache/calls`), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  };
  const invoke = (event, input = {}, options = {}) =>
    dispatch(event, JSON.stringify({ cwd: root, ...input }), { root, ...options });
  return { root, write, git, calls, invoke };
}
