import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { settingsSchema } from "../../src/core/config/settings.js";
import { envExampleProblems } from "./env-example.js";
import { isGenerated, projectFiles } from "./files.js";
import { gitEnvironment } from "./git-environment.js";
import { mailLocaleProblems } from "./mail-locales.js";

function lineCount(text: string): number {
  return text === "" ? 0 : text.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

function suppressionProblems(file: string, text: string): string[] {
  const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const ranges = new Map<number, ts.CommentRange>();
  function visit(node: ts.Node) {
    for (const range of [
      ...(ts.getLeadingCommentRanges(text, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.end) ?? []),
    ])
      ranges.set(range.pos, range);
    for (const child of node.getChildren(parsed)) visit(child);
  }
  visit(parsed);
  const problems: string[] = [];
  for (const range of ranges.values()) {
    const comment = text.slice(range.pos, range.end);
    if (
      file === "scripts/lint/fixtures/negative/ban-ts-comment/src/service.ts" &&
      range.pos === 0 &&
      comment.trimEnd() === "// @ts-expect-error"
    )
      continue;
    for (const [offset, line] of comment.split(/\r?\n/).entries()) {
      if (!/(?:eslint-disable(?:-next-line|-line)?|@ts-expect-error)\b/.test(line)) continue;
      if (/--\s*[^\s*/]/.test(line)) continue;
      const number = parsed.getLineAndCharacterOfPosition(range.pos).line + offset + 1;
      problems.push(
        `${file}:${String(number)} 억제 주석에 사유가 없다 — "-- 사유"를 같은 줄에 적는다`,
      );
    }
  }
  return problems;
}

export function harnessProblems(root: string): string[] {
  const files = projectFiles(root);
  const fileSet = new Set(files);
  const problems: string[] = [];
  if (!fileSet.has("AGENTS.md")) problems.push("AGENTS.md — 프로젝트 루트에 지침을 둔다");
  else {
    const count = lineCount(readFileSync(join(root, "AGENTS.md"), "utf8"));
    if (count > 200)
      problems.push(`AGENTS.md: ${String(count)}줄 — 루트 지침은 200줄 이하로 나눈다`);
  }
  for (const file of files) {
    if (isGenerated(file)) continue;
    if (/\.(?:[cm]?[jt]sx?)$/.test(file)) {
      const text = readFileSync(join(root, file), "utf8");
      const count = lineCount(text);
      const test =
        /(?:^|\/)(?:tests?|fixtures)\//.test(file) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
      const limit = test ? 600 : 400;
      if (count > limit)
        problems.push(
          `${file}: ${String(count)}줄 — ${test ? "시험은" : "소스는"} ${String(limit)}줄 이하로 나눈다`,
        );
      problems.push(...suppressionProblems(file, text));
    }
    if (basename(file) === "AGENTS.md" || basename(file) === "CLAUDE.md") {
      const agent = join(dirname(file), "AGENTS.md").replaceAll("\\", "/");
      const claude = join(dirname(file), "CLAUDE.md").replaceAll("\\", "/");
      if (!fileSet.has(agent)) problems.push(`${file} — 같은 폴더에 AGENTS.md를 둔다`);
      if (!fileSet.has(claude)) problems.push(`${file} — 같은 폴더에 CLAUDE.md를 둔다`);
      if (file === claude) {
        const text = readFileSync(join(root, file), "utf8").trim();
        if (file === "CLAUDE.md") {
          if (text.split(/\r?\n/)[0] !== "@AGENTS.md")
            problems.push(`${file} — 첫 줄에 @AGENTS.md import를 적는다`);
        } else if (text !== "@AGENTS.md") problems.push(`${file} — @AGENTS.md 한 줄만 적는다`);
      }
    }
  }
  if (fileSet.has(".env.example"))
    problems.push(
      ...envExampleProblems(
        readFileSync(join(root, ".env.example"), "utf8"),
        Object.keys(settingsSchema.shape),
      ),
    );
  else problems.push(".env.example — 설정 키의 공개 예시를 둔다");
  try {
    const tracked = execFileSync("git", ["ls-files", "--", "src/generated"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: gitEnvironment(),
    });
    for (const file of tracked.trim().split("\n").filter(Boolean))
      problems.push(`${file} — 생성물은 git에서 추적하지 않는다`);
  } catch {
    problems.push("src/generated — git ls-files로 생성물 추적 여부를 확인할 수 없다");
  }
  problems.push(...mailLocaleProblems(root));
  return problems;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const problems = harnessProblems(process.cwd());
  if (problems.length) {
    process.stderr.write(`${problems.join("\n")}\n`);
    process.exitCode = 1;
  }
}
