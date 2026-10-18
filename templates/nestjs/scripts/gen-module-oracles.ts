import ts from "typescript";
import type { ModuleNames } from "./gen-module-transform.js";

const permissionMarkers = [
  "admin:access",
  "users:read",
  "users:manage",
  "roles:read",
  "roles:manage",
  "audit-logs:read",
  "posts:create",
  "posts:manage",
];
const actionMarkers = [
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
function strings(node: ts.Node | undefined): string[] | undefined {
  if (!node || !ts.isArrayLiteralExpression(node)) return undefined;
  const values: string[] = [];
  for (const element of node.elements) {
    if (!ts.isStringLiteral(element)) return undefined;
    values.push(element.text);
  }
  return values;
}
function addPermissions(previous: readonly string[], names: ModuleNames): string[] {
  const result = [...previous];
  const archive = result.indexOf("posts:archive");
  result.splice(
    archive < 0 ? result.length : archive,
    0,
    `${names.name}:create`,
    `${names.name}:manage`,
  );
  return previous.every((value, index) => value === [...previous].sort()[index])
    ? result.sort()
    : result;
}
function property(node: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  const item = node.properties.find(
    (value) =>
      value.name &&
      (ts.isIdentifier(value.name) || ts.isStringLiteral(value.name)) &&
      value.name.text === name,
  );
  return item && ts.isPropertyAssignment(item) ? item.initializer : undefined;
}
function rewrite(source: string, path: string, names: ModuleNames): string {
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const edits: { start: number; end: number; text: string }[] = [];
  const replace = (node: ts.Node, value: unknown) => {
    edits.push({ start: node.getStart(tree), end: node.end, text: JSON.stringify(value) });
  };
  let ascending: string[] | undefined;
  function findAscending(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "ascending") {
      const values = strings(node.initializer);
      if (values) ascending = addPermissions(values, names);
    }
    ts.forEachChild(node, findAscending);
  }
  findAscending(tree);
  function visit(node: ts.Node) {
    const values = strings(node);
    if (values && permissionMarkers.every((code) => values.includes(code))) {
      replace(node, addPermissions(values, names));
      return;
    }
    if (values && actionMarkers.every((action) => values.includes(action))) {
      const expanded = [...values];
      expanded.splice(
        expanded.indexOf("post.deleted_by_admin") + 1,
        0,
        `${names.singular}.deleted_by_admin`,
      );
      replace(node, expanded);
      return;
    }
    if (
      ts.isObjectLiteralExpression(node) &&
      permissionMarkers.every((code) => property(node, code))
    ) {
      const map: Record<string, string> = {};
      for (const item of node.properties) {
        if (
          !ts.isPropertyAssignment(item) ||
          !ts.isStringLiteral(item.name) ||
          !ts.isStringLiteral(item.initializer)
        )
          throw new Error(`${path}: 권한 설명 예상값은 명시 literal이어야 한다`);
        map[item.name.text] = item.initializer.text;
      }
      map[`${names.name}:create`] = `${names.name} 리소스를 만든다.`;
      map[`${names.name}:manage`] = `모든 ${names.name} 리소스를 관리한다.`;
      replace(node, map);
      return;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (
        path.endsWith("record.test.ts") &&
        node.expression.getText(tree) === "expect(rows).toHaveLength"
      ) {
        const count = node.arguments[0];
        if (!count || !ts.isNumericLiteral(count))
          throw new Error(`${path}: 감사 개수 literal이 없다`);
        replace(count, Number(count.text) + 1);
        return;
      }
      const argument = node.arguments[0];
      if (
        ascending &&
        node.expression.name.text === "toMatchObject" &&
        argument &&
        ts.isObjectLiteralExpression(argument)
      ) {
        const meta = property(argument, "meta");
        const page =
          meta && ts.isObjectLiteralExpression(meta) ? property(meta, "page") : undefined;
        if (page && ts.isObjectLiteralExpression(page)) {
          const size = property(page, "size"),
            number = property(page, "number");
          if (!size || !number || !ts.isNumericLiteral(size) || !ts.isNumericLiteral(number))
            throw new Error(`${path}: 페이지 예상값은 명시 숫자여야 한다`);
          const pageSize = Number(size.text),
            pageNumber = Number(number.text);
          replace(argument, {
            data: ascending
              .slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
              .map((id) => ({ id, attributes: { group: id.split(":")[0] } })),
            meta: {
              page: {
                number: pageNumber,
                size: pageSize,
                total: ascending.length,
                totalPages: Math.ceil(ascending.length / pageSize),
              },
            },
          });
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!edits.length) throw new Error(`${path}: 엄격한 골든 예상값을 찾지 못했다`);
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  return result;
}
export function extendModuleOracles(
  read: (path: string) => string,
  names: ModuleNames,
): Map<string, string> {
  const paths = [
    "src/core/audit/tests/record.test.ts",
    "src/core/http/tests/operation-guard.test.ts",
    "src/modules/roles/tests/permissions.test.ts",
    "tests/integration/permissions.test.ts",
    "tests/integration/seed.test.ts",
    "tests/integration/audit-logs.test.ts",
  ];
  const output = new Map(paths.map((path) => [path, rewrite(read(path), path, names)]));
  const audit = "tests/integration/audit-logs.test.ts";
  const text = output.get(audit) ?? "";
  const anchor = "  const replacement =";
  if (text.split(anchor).length !== 2)
    throw new Error(`${audit}: 감사 원인 흐름 위치가 하나가 아니다`);
  const created = `${names.single}AuditResource`;
  const scenario = `  await f.unit.run(async (tx) => {
    const role = await tx.role.create({ data: { name: "${names.name}-audit-author", permissions: ["${names.name}:create"] } });
    await tx.userRole.create({ data: { userId: member.user.id, roleId: role.id } });
  });
  const ${created} = await f.post("${names.name}", { title: "관리자 삭제 감사", body: "본문" }, member.session.attributes.accessToken);
  expect(${created}.status).toBe(201);
  expect((await f.http.delete("/api/v1/${names.name}/" + resourceDocument(${created}.text).data.id).set("Authorization", "Bearer " + f.token)).status).toBe(204);
`;
  output.set(audit, text.replace(anchor, scenario + anchor));
  const routePath = "src/core/http/tests/route-audit.test.ts";
  const routeSource = read(routePath);
  const routeTree = ts.createSourceFile(routePath, routeSource, ts.ScriptTarget.Latest, true);
  const edits: { start: number; end: number; text: string }[] = [];
  function route(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(routeTree) === "expect(routes).toHaveLength"
    ) {
      const count = node.arguments[0];
      if (!count || !ts.isNumericLiteral(count))
        throw new Error(`${routePath}: 라우트 개수 literal이 없다`);
      edits.push({
        start: count.getStart(routeTree),
        end: count.end,
        text: String(Number(count.text) + 5),
      });
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(routeTree) === "expect.arrayContaining"
    ) {
      const array = node.arguments[0];
      if (
        array &&
        ts.isArrayLiteralExpression(array) &&
        array.getText(routeTree).includes('"/api/v1/posts"')
      ) {
        const added = [
          { method: "GET", path: `/api/v1/${names.name}` },
          { method: "POST", path: `/api/v1/${names.name}` },
          { method: "GET", path: `/api/v1/${names.name}/:id` },
          { method: "PATCH", path: `/api/v1/${names.name}/:id` },
          { method: "DELETE", path: `/api/v1/${names.name}/:id` },
        ];
        edits.push({
          start: array.end - 1,
          end: array.end - 1,
          text: `${array.elements.hasTrailingComma ? "" : ","}${added.map((value) => JSON.stringify(value)).join(",")}`,
        });
      }
    }
    ts.forEachChild(node, route);
  }
  route(routeTree);
  if (edits.length !== 2) throw new Error(`${routePath}: 엄격한 라우트 예상값이 하나가 아니다`);
  let routes = routeSource;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    routes = routes.slice(0, edit.start) + edit.text + routes.slice(edit.end);
  output.set(routePath, routes);
  return output;
}
