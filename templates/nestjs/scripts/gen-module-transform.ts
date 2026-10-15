import ts from "typescript";

export function moduleNames(name: string) {
  if (!/^[a-z]+(?:-[a-z]+)*s$/.test(name) || name.endsWith("ss"))
    throw new Error("모듈 이름은 소문자 kebab 복수형으로 적는다(예: widgets, blog-entries)");
  const singular = name.replace(/ies$/, "y").replace(/(?<!ie)s$/, "");
  const pascal = (value: string) =>
    value
      .split("-")
      .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
      .join("");
  const lower = (value: string) => value.slice(0, 1).toLowerCase() + value.slice(1);
  return {
    name,
    singular,
    pluralClass: pascal(name),
    model: pascal(singular),
    plural: lower(pascal(name)),
    single: lower(pascal(singular)),
    table: name.replaceAll("-", "_"),
    constant: singular.replaceAll("-", "_").toUpperCase(),
  };
}
export type ModuleNames = ReturnType<typeof moduleNames>;

export function renameGolden(source: string, names: ModuleNames): string {
  const identifier = (value: string) =>
    value
      .replace(/^POST(?=_)/, names.constant)
      .replace(/Posts?(?=[A-Z_]|$)/g, (token) =>
        token === "Posts" ? names.pluralClass : names.model,
      )
      .replace(/^posts?(?=[A-Z_]|$)/, (token) => (token === "posts" ? names.plural : names.single));
  const literal = (value: string) =>
    value
      .replace(/\bFROM posts\b/g, `FROM ${names.table}`)
      .replace(/\bposts?\b/g, (token) => (token === "posts" ? names.name : names.singular))
      .replace(/Posts?(?=[A-Z_]|\b)/g, (token) =>
        token === "Posts" ? names.pluralClass : names.model,
      );
  const parsed = ts.createSourceFile("module.ts", source, ts.ScriptTarget.Latest, true);
  const result = ts.transform(parsed, [
    (context) => {
      const visit: ts.Visitor = (node) => {
        if (
          ts.isPropertyAccessExpression(node) &&
          node.name.text === "posts" &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "fields"
        )
          return ts.factory.createElementAccessExpression(
            ts.visitNode(node.expression, visit) as ts.Expression,
            ts.factory.createStringLiteral(names.name),
          );
        if (
          ts.isPropertyAssignment(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === "posts"
        )
          return ts.factory.updatePropertyAssignment(
            node,
            ts.factory.createStringLiteral(names.name),
            ts.visitNode(node.initializer, visit) as ts.Expression,
          );
        if (ts.isIdentifier(node)) return ts.factory.createIdentifier(identifier(node.text));
        if (ts.isStringLiteral(node)) return ts.factory.createStringLiteral(literal(node.text));
        if (ts.isNoSubstitutionTemplateLiteral(node))
          return ts.factory.createNoSubstitutionTemplateLiteral(literal(node.text));
        if (ts.isTemplateHead(node)) return ts.factory.createTemplateHead(literal(node.text));
        if (ts.isTemplateMiddle(node)) return ts.factory.createTemplateMiddle(literal(node.text));
        if (ts.isTemplateTail(node)) return ts.factory.createTemplateTail(literal(node.text));
        return ts.visitEachChild(node, visit, context);
      };
      return (node) => ts.visitNode(node, visit) as ts.SourceFile;
    },
  ]);
  try {
    return ts.createPrinter().printFile(result.transformed[0] as ts.SourceFile);
  } finally {
    result.dispose();
  }
}
