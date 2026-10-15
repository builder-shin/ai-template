import { runInNewContext } from "node:vm";
import ts from "typescript";

export const permissions = [
  "admin:access",
  "users:read",
  "users:manage",
  "roles:read",
  "roles:manage",
  "audit-logs:read",
  "posts:create",
  "posts:manage",
];
export const actions = [
  "session.login_succeeded",
  "session.login_failed",
  "session.all_revoked",
  "user.password_changed",
  "user.password_reset",
  "user.roles_changed",
  "user.deactivated",
  "user.reactivated",
  "user.deleted",
  "role.created",
  "role.updated",
  "role.deleted",
  "post.deleted_by_admin",
];
export const descriptions = {
  "admin:access": "Sign in to the admin app.",
  "users:read": "Read every user's full profile.",
  "users:manage": "Change a user's status and roles.",
  "roles:read": "Read roles and permissions.",
  "roles:manage": "Create, change and delete roles.",
  "audit-logs:read": "Read audit logs.",
  "posts:create": "Write posts.",
  "posts:manage": "Manage every post, including drafts.",
};
export const parse = (source: string) =>
  ts.createSourceFile("fixture.ts", source, ts.ScriptTarget.Latest, true);
export function nodes<T extends ts.Node>(
  source: ts.Node,
  matches: (node: ts.Node) => node is T,
): T[] {
  const found: T[] = [];
  function visit(node: ts.Node) {
    if (matches(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}
export function evaluate(
  node: ts.Node,
  source: ts.SourceFile,
  bindings: Record<string, unknown> = {},
): unknown {
  const module = { exports: undefined as unknown };
  const text = ts.transpileModule(`module.exports = (${node.getText(source)});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  }).outputText;
  runInNewContext(text, { ...bindings, module });
  return module.exports;
}
export function stringArrays(source: ts.SourceFile, includes: string): string[][] {
  return nodes(source, ts.isArrayLiteralExpression)
    .filter(
      (node) =>
        node.elements.every(ts.isStringLiteral) &&
        node.elements.some((item) => ts.isStringLiteral(item) && item.text === includes),
    )
    .map((node) => evaluate(node, source) as string[]);
}
export function variable(source: ts.SourceFile, name: string): ts.Expression {
  const declaration = nodes(source, ts.isVariableDeclaration).find(
    (node) => node.name.getText(source) === name,
  );
  if (!declaration?.initializer) throw new Error(`${name}: 독립 예상값 선언이 없다`);
  return declaration.initializer;
}
