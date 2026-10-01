import ts from "typescript";
import { GenerateError, rename, type Names } from "./names";

const marker = /gen:feature:\s*(.*?)(?:\s*\*\/)?$/;
export function directive(line: string) {
  return line.match(marker)?.[1]?.trim();
}

/** FastAPI gen:module과 같은 빼기·그대로·고칠 곳 표시를 따른다. */
function prepare(source: string) {
  let inside = false;
  const lines = source.split(/\r?\n/).filter((line) => {
    const said = directive(line);
    if (said === "빼기 시작") {
      if (inside) throw new GenerateError("빼기 표시는 중첩하지 않는다.");
      inside = true;
      return false;
    }
    if (said === "빼기 끝") {
      if (!inside) throw new GenerateError("빼기 끝 앞에 빼기 시작을 둔다.");
      inside = false;
      return false;
    }
    return !inside && said !== "빼기";
  });
  if (inside) throw new GenerateError("빼기 시작 뒤에 빼기 끝을 둔다.");
  return lines;
}

function contractString(node: ts.Node) {
  const parent = node.parent;
  if (ts.isLiteralTypeNode(parent) && ts.isIndexedAccessTypeNode(parent.parent)) return true;
  if (ts.isStringLiteral(node) && /^post\./.test(node.text)) return true;
  if (ts.isPropertyAssignment(parent) && parent.name.getText() === "type") return true;
  if (ts.isCallExpression(parent)) {
    const call = parent.expression.getText();
    if (
      parent.arguments[0] === node &&
      /(?:\.(?:GET|POST|PATCH|DELETE)|\bbuildQuery|\buseChannel)$/.test(call)
    )
      return true;
  }
  return false;
}

export function transform(source: string, names: Names, filename = "feature.tsx") {
  const lines = prepare(source);
  const text = lines.join("\n");
  const kept = new Set(
    lines.flatMap((line, index) => (directive(line) === "그대로" ? [index] : [])),
  );
  if (!/\.[cm]?tsx?$/.test(filename))
    return lines.map((line, index) => (kept.has(index) ? line : rename(line, names))).join("\n");
  const tree = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const edits: { start: number; end: number; value: string }[] = [];
  function visit(node: ts.Node) {
    const start = node.getStart(tree);
    const line = tree.getLineAndCharacterOfPosition(start).line;
    const identifier = ts.isIdentifier(node);
    const literal =
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isRegularExpressionLiteral(node);
    if ((identifier || literal) && !kept.has(line)) {
      const method =
        identifier &&
        /^(GET|POST|PATCH|DELETE)$/.test(node.text) &&
        ts.isPropertyAccessExpression(node.parent);
      if (!method && !(literal && contractString(node))) {
        const original = node.getText(tree);
        const value = rename(original, names, identifier ? "identifier" : "text");
        if (value !== original) edits.push({ start, end: node.end, value });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  // AST는 주석을 자식 노드로 주지 않는다. scanner로 실제 주석만 더한다.
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, text);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    )
      continue;
    const start = scanner.getTokenPos();
    const line = tree.getLineAndCharacterOfPosition(start).line;
    if (kept.has(line)) continue;
    const original = scanner.getTokenText();
    const value = rename(original, names);
    // 템플릿 본문을 scanner가 주석으로 읽어도 AST의 편집과 겹치면 무시한다.
    if (value !== original && !edits.some((edit) => edit.start <= start && edit.end > start))
      edits.push({ start, end: scanner.getTextPos(), value });
  }
  let result = text;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  return result;
}
