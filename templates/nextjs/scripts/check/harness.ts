import ts from "typescript";
import { envKeys } from "../envfile.mjs";
import { isGenerated } from "./files";
import { loadingCopyProblems } from "./loading-copy";
import { parseAppConfig } from "../../src/lib/app-config.mjs";

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
  function check(position: number, comments: readonly { pos: number; end: number }[]) {
    const line = file.getLineAndCharacterOfPosition(position).line;
    if (checked.has(line)) return;
    const start = file.getPositionOfLineAndCharacter(line, 0);
    const end = start + (lines[line]?.length ?? 0);
    if (
      !comments.some((comment) =>
        /(?:사유:|--|reason:)\s*\S.{3,}/.test(
          source.slice(Math.max(start, comment.pos), Math.min(end, comment.end)),
        ),
      )
    ) {
      checked.add(line);
      problems.push(`${path}:${line + 1} 억제 — 같은 줄에 사유: 설명을 적는다.`);
    }
  }
  const ranges = new Map<number, { pos: number; end: number }>();
  function collectComments(node: ts.Node) {
    const children = node.getChildren(file);
    if (children.length) {
      children.forEach(collectComments);
    } else if (node.kind !== ts.SyntaxKind.JsxText) {
      // 파서가 구분한 토큰 앞의 trivia만 읽어 템플릿·JSX 본문을 제외한다.
      const start = node.getStart(file);
      const collect = (pos: number, end: number) => {
        if (end <= start) ranges.set(pos, { pos, end });
      };
      ts.forEachLeadingCommentRange(source, node.pos, collect);
      ts.forEachTrailingCommentRange(source, node.pos, collect);
    }
  }
  collectComments(file);
  const comments = [...ranges.values()];
  for (const comment of comments)
    for (const match of source
      .slice(comment.pos, comment.end)
      .matchAll(/eslint-disable\b|@ts-(?:expect-error|ignore|nocheck)\b/g))
      check(comment.pos + match.index, [comment]);
  function visit(node: ts.Node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const position = node.getStart(file);
      check(
        position,
        comments.filter((comment) => comment.pos > position),
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return problems;
}

export function checkHarness(
  files: Record<string, string>,
  schemaKeys: readonly string[],
): string[] {
  const problems: string[] = [];
  if ("app.config.json" in files) {
    try {
      const config = parseAppConfig(JSON.parse(files["app.config.json"]!));
      const pkg = JSON.parse(files["package.json"] ?? "{}");
      if (pkg.scripts?.start !== `next start --port ${config.ports.dev}`)
        problems.push(
          `package.json:1 start 포트가 다르다 — next start --port ${config.ports.dev}으로 고치고 app.config.json과 맞춘다.`,
        );
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!("AGENTS.md" in files)) problems.push("AGENTS.md:1 지침 — 루트 지침을 만든다.");
  for (const [path, content] of Object.entries(files)) {
    problems.push(...loadingCopyProblems(path, content));
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
