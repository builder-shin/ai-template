import ts from "typescript";

const forbidden = /\bloading\b|로딩\s*중|불러오는\s*중/i;

/** UI 문구와 카탈로그를 검사한다. 화면 낭독기의 스피너 이름만 예외다. */
export function loadingCopyProblems(path: string, source: string): string[] {
  const problems: string[] = [];
  const report = (text: string, line: number) => {
    if (forbidden.test(text))
      problems.push(`${path}:${line} 로딩 문구 — 스피너나 스켈레톤을 쓴다.`);
  };
  if (/^messages\/[^/]+\.json$/.test(path)) {
    const visit = (value: unknown, keys: string[]) => {
      if (typeof value === "string") {
        if (keys.join(".") !== "accessibility.spinner") report(value, 1);
      } else if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) visit(item, [...keys, key]);
      }
    };
    visit(JSON.parse(source), []);
  } else if (/^src\/.*\.tsx$/.test(path) && !/\.test\.tsx$|\/generated\//.test(path)) {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      if (ts.isJsxAttribute(node) && node.name.getText(file) === "aria-label") return;
      if (ts.isJsxText(node) || ts.isStringLiteralLike(node)) {
        report(node.text, file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return problems;
}
