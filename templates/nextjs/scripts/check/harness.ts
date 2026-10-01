import ts from "typescript";
import { envKeys } from "../envfile.mjs";
import { isGenerated } from "./files";

const lineCount = (text: string) => (text ? text.replace(/\n$/, "").split("\n").length : 0);

function suppressionProblems(path: string, source: string): string[] {
  const problems: string[] = [];
  const lines = source.split(/\r?\n/);
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const checked = new Set<number>();
  function check(position: number) {
    const line = file.getLineAndCharacterOfPosition(position).line;
    if (checked.has(line)) return;
    checked.add(line);
    if (!/(?:사유:|--|reason:)\s*\S.{3,}/.test(lines[line] ?? "")) {
      problems.push(`${path}:${line + 1} 억제 — 같은 줄에 사유: 설명을 적는다.`);
    }
  }
  function visit(node: ts.Node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) check(node.getStart(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    source,
  );
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      (token === ts.SyntaxKind.SingleLineCommentTrivia ||
        token === ts.SyntaxKind.MultiLineCommentTrivia) &&
      /eslint-disable|@ts-expect-error|@ts-ignore/.test(scanner.getTokenText())
    )
      check(scanner.getTokenPos());
  }
  return problems;
}

export function checkHarness(
  files: Record<string, string>,
  schemaKeys: readonly string[],
): string[] {
  const problems: string[] = [];
  if (!("AGENTS.md" in files)) problems.push("AGENTS.md:1 지침 — 루트 지침을 만든다.");
  for (const [path, content] of Object.entries(files)) {
    if (/(^|\/)AGENTS.md$/.test(path)) {
      const paired = path.replace(/AGENTS.md$/, "CLAUDE.md");
      if (!(paired in files)) problems.push(`${paired}:1 지침 — @AGENTS.md 한 줄을 적는다.`);
    }
    if (/(^|\/)CLAUDE.md$/.test(path)) {
      if (!(path.replace(/CLAUDE.md$/, "AGENTS.md") in files))
        problems.push(`${path}:1 지침 — AGENTS.md 원본을 만든다.`);
      if (content.trim() !== "@AGENTS.md")
        problems.push(`${path}:1 지침 — @AGENTS.md 한 줄만 적는다.`);
    }
    if (path === "AGENTS.md" && lineCount(content) > 200)
      problems.push(`${path}:201 크기 — 200줄 이하로 나눈다.`);
    if (isGenerated(path)) {
      // 동기화한 계약은 원본 헤더를 보존하고 각 패키지에서 최신 여부를 검사한다.
      if (path.startsWith("contract/")) continue;
      if (!/직접 수정 금지|do not edit/i.test(content.split("\n")[0] ?? "")) {
        problems.push(`${path}:1 생성물 — 생성기에 직접 수정 금지 헤더를 더한다.`);
      }
      continue;
    }
    if (!/\.(?:[cm]?[jt]sx?)$/.test(path) || path === "next-env.d.ts") continue;
    const limit = /(?:\.test\.[^/]+$|^e2e\/|\/fixtures\/)/.test(path) ? 600 : 400;
    if (lineCount(content) > limit)
      problems.push(`${path}:${limit + 1} 크기 — ${limit}줄 이하로 나눈다.`);
    problems.push(...suppressionProblems(path, content));
  }
  const exampleKeys = new Set<string>(envKeys(files[".env.example"] ?? ""));
  const schema = new Set(schemaKeys);
  for (const key of schema)
    if (!exampleKeys.has(key)) problems.push(`.env.example:1 환경 — ${key}를 더한다.`);
  for (const key of exampleKeys)
    if (!schema.has(key)) problems.push(`.env.example:1 환경 — ${key}를 지우거나 스키마에 더한다.`);
  return problems;
}
