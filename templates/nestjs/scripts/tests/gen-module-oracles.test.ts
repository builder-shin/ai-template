import { existsSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { genModule } from "../gen-module.js";
import { generatorFixture } from "./fixtures/generated-module.js";
import {
  actions,
  descriptions,
  evaluate,
  nodes,
  oracleBaseline,
  parse,
  permissions,
  stringArrays,
  variable,
} from "./fixtures/generated-oracles.js";

let fixture: ReturnType<typeof generatorFixture>;
const names = ["fixture-widgets", "a-fixture-gadgets"];
const addedPermissions = names.flatMap((name) => [`${name}:create`, `${name}:manage`]);
const read = (path: string) => parse(fixture.read(path));
function oracleTests(nested = false) {
  let allPermissions: string[];
  let allActions: string[];
  let allDescriptions: Record<string, string>;
  beforeEach(async () => {
    fixture = generatorFixture();
    const original = oracleBaseline(fixture.read);
    let baseline = original;
    if (nested) {
      const outer = fixture;
      try {
        const name = existsSync(join(outer.root, "src/modules/widgets"))
          ? "outer-fixture-widgets"
          : "widgets";
        await genModule(outer.root, name);
        fixture = generatorFixture(outer.root);
        baseline = oracleBaseline(fixture.read);
        expect(baseline.permissions).toEqual([
          ...original.permissions,
          `${name}:create`,
          `${name}:manage`,
        ]);
        expect(baseline.actions).toEqual([
          ...original.actions.slice(0, 13),
          `${name.slice(0, -1)}.deleted_by_admin`,
          ...original.actions.slice(13),
        ]);
        expect(baseline.descriptions).toEqual({
          ...original.descriptions,
          [`${name}:create`]: `${name} 리소스를 만든다.`,
          [`${name}:manage`]: `모든 ${name} 리소스를 관리한다.`,
        });
      } finally {
        outer.close();
      }
    }
    expect(baseline.permissions.slice(0, 8)).toEqual(permissions);
    expect(baseline.actions.slice(0, 13)).toEqual(actions);
    expect(
      Object.fromEntries(Object.keys(descriptions).map((key) => [key, baseline.descriptions[key]])),
    ).toEqual(descriptions);
    allPermissions = [...baseline.permissions, ...addedPermissions];
    allActions = [
      ...baseline.actions.slice(0, 13),
      "a-fixture-gadget.deleted_by_admin",
      "fixture-widget.deleted_by_admin",
      ...baseline.actions.slice(13),
    ];
    allDescriptions = {
      ...baseline.descriptions,
      ...Object.fromEntries(
        names.flatMap((name) => [
          [`${name}:create`, `${name} 리소스를 만든다.`],
          [`${name}:manage`, `모든 ${name} 리소스를 관리한다.`],
        ]),
      ),
    };
    expect(allPermissions).toHaveLength(original.permissions.length + (nested ? 6 : 4));
    expect(allActions).toHaveLength(original.actions.length + (nested ? 3 : 2));
    for (const name of names) await genModule(fixture.root, name);
  });
  afterEach(() => {
    fixture.close();
  });
  it("생성 사본 감사의 정확한 action 순서를 독립 literal로 확장한다", () => {
    const source = read("src/core/audit/tests/record.test.ts");
    expect(stringArrays(source, "session.login_succeeded")).toEqual([allActions]);
  });
  it("생성 사본 감사의 정확한 행 개수 단언도 재생한다", () => {
    const source = read("src/core/audit/tests/record.test.ts");
    const calls = nodes(source, ts.isCallExpression).filter(
      (node) => node.expression.getText(source) === "expect(rows).toHaveLength",
    );
    expect(calls).toHaveLength(1);
    for (const node of calls)
      evaluate(node, source, { expect, rows: allActions.map((action) => ({ action })) });
  });
  it.each([undefined, "-id"])("생성 권한의 정확한 정렬·역순 단언을 재생한다: %s", (sort) => {
    const source = read("src/core/http/tests/operation-guard.test.ts");
    const ascending = evaluate(variable(source, "ascending"), source);
    const ordered = [...allPermissions].sort();
    expect(ascending).toEqual(ordered);
    const call = nodes(source, ts.isCallExpression).find((node) =>
      node.arguments[0]?.getText(source).startsWith("sort ?"),
    );
    expect(call).toBeDefined();
    if (call)
      evaluate(call, source, {
        expect,
        sort,
        ascending,
        doc: { data: (sort ? ordered.toReversed() : ordered).map((id) => ({ id })) },
      });
  });
  it("새 이름의 정렬 위치를 반영한 페이지 항목·총수·전체 페이지를 정확히 보존한다", () => {
    const source = read("src/core/http/tests/operation-guard.test.ts");
    const call = nodes(source, ts.isCallExpression).find(
      (node) =>
        node.expression.getText(source).endsWith(".toMatchObject") &&
        node.arguments[0]?.getText(source).includes("totalPages"),
    );
    if (!call?.arguments[0]) throw new Error("정확한 페이지 fixture가 없다");
    expect(evaluate(call.arguments[0], source)).toEqual({
      data: [...allPermissions]
        .sort()
        .slice(2, 4)
        .map((id) => ({ id, attributes: { group: id.split(":")[0] } })),
      meta: {
        page: {
          number: 2,
          size: 2,
          total: allPermissions.length,
          totalPages: Math.ceil(allPermissions.length / 2),
        },
      },
    });
  });
  it("설명 map은 기존 여덟 literal과 생성 이름의 두 문구를 정확히 포함한다", () => {
    const source = read("src/core/http/tests/operation-guard.test.ts");
    const object = nodes(source, ts.isObjectLiteralExpression).find((node) =>
      node.properties.some(
        (property) => property.name && property.name.getText(source) === '"admin:access"',
      ),
    );
    if (!object) throw new Error("설명의 정확한 예상 map이 없다");
    expect(evaluate(object, source)).toEqual(allDescriptions);
  });
  it("OpenAPI 단언의 정확한 AuditLogAction enum도 확장한다", () => {
    expect(
      stringArrays(read("src/core/http/tests/operation-guard.test.ts"), "session.login_succeeded"),
    ).toEqual([allActions]);
  });
  it("admin Set과 include 배열은 의도적인 posts:archive까지 보존한다", () => {
    const arrays = stringArrays(
      read("src/modules/roles/tests/permissions.test.ts"),
      "admin:access",
    );
    expect(arrays).toEqual([
      [...allPermissions, "posts:archive"],
      [...allPermissions, "posts:archive"],
    ]);
  });
  it("통합 권한 정렬과 시드 Set의 정적 예상 목록도 완전하게 확장한다", () => {
    expect(stringArrays(read("tests/integration/permissions.test.ts"), "admin:access")).toEqual([
      [...allPermissions].sort(),
    ]);
    expect(stringArrays(read("tests/integration/seed.test.ts"), "admin:access")).toEqual([
      allPermissions,
    ]);
  });
  it("통합 감사는 확장한 정확한 목록에 대응하는 새 리소스 생성·관리자 삭제 흐름을 만든다", async () => {
    const source = read("tests/integration/audit-logs.test.ts");
    expect(
      stringArrays(source, "session.login_succeeded").map((values) => values.toSorted()),
    ).toEqual([[...allActions].sort()]);
    const statements = nodes(source, ts.isVariableStatement).filter((statement) =>
      nodes(statement, ts.isCallExpression).some(
        (node) =>
          node.expression.getText(source) === "f.post" &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0]) &&
          names.includes(node.arguments[0].text),
      ),
    );
    expect(statements).toHaveLength(2);
    const effects: string[] = [];
    for (const statement of statements) {
      const block = statement.parent;
      if (!ts.isBlock(block)) throw new Error("감사 흐름 block이 없다");
      const index = block.statements.indexOf(statement);
      const previous = block.statements[index - 1];
      const grant = previous?.getText(source).startsWith("await f.unit.run") ? 1 : 0;
      const text = block.statements
        .slice(index - grant, index + 3)
        .map((node) => node.getText(source))
        .join("\n");
      const granted = new Set<string>();
      const f = {
        token: "admin",
        unit: {
          run: (body: (tx: unknown) => Promise<void>) =>
            body({
              role: {
                create: ({ data }: { data: { permissions: string[] } }) => {
                  return Promise.resolve({ id: data.permissions[0] });
                },
              },
              userRole: {
                create: ({ data }: { data: { userId: string; roleId: string } }) => {
                  expect(data.userId).toBe("author-id");
                  granted.add(data.roleId);
                  effects.push(`grant:${data.roleId}:${data.userId}`);
                  return Promise.resolve();
                },
              },
            }),
        },
        post: (name: string, _body: unknown, token: string) => {
          if (!granted.has(`${name}:create`)) throw new Error("새 리소스 생성 권한 없는 작성자다");
          effects.push(`create:${name}:${token}`);
          return Promise.resolve({ status: 201, text: JSON.stringify({ data: { id: "new-id" } }) });
        },
        http: {
          delete: (url: string) => ({
            set: (_name: string, token: string) => {
              effects.push(`delete:${url}:${token}`);
              return Promise.resolve({ status: 204 });
            },
          }),
        },
      };
      const code = ts.transpileModule(`(async () => { ${text} })()`, {
        compilerOptions: { target: ts.ScriptTarget.ES2023 },
      }).outputText;
      await runInNewContext(code, {
        f,
        member: { user: { id: "author-id" }, session: { attributes: { accessToken: "author" } } },
        expect,
        resourceDocument: JSON.parse,
      });
    }
    expect(effects.toSorted()).toEqual(
      names
        .flatMap((name) => [
          `grant:${name}:create:author-id`,
          `create:${name}:author`,
          `delete:/api/v1/${name}/new-id:Bearer admin`,
        ])
        .sort(),
    );
  });
}
oracleTests();
describe("바깥 모듈을 생성한 사본에서 같은 엄격 단언을 재생한다", () => {
  oracleTests(true);
});
