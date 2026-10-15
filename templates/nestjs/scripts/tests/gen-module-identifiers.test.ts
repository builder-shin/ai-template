import ts from "typescript";
import { afterEach, beforeEach, expect, it } from "vitest";
import { genModule } from "../gen-module.js";
import { moduleNames, renameGolden } from "../gen-module-transform.js";
import { fixtureLoader, generatorFixture } from "./fixtures/generated-module.js";
import { nodes, parse } from "./fixtures/generated-oracles.js";

let fixture: ReturnType<typeof generatorFixture>;
beforeEach(() => {
  fixture = generatorFixture();
});
afterEach(() => {
  fixture.close();
});
it("생성한 모든 소스·복사 시험의 camel 구간에도 posts 식별자가 남지 않는다", async () => {
  const files = await genModule(fixture.root, "fixture-widgets");
  const generated = files.filter(
    (file) => file.startsWith("src/modules/fixture-widgets/") && file.endsWith(".ts"),
  );
  expect(generated.length).toBeGreaterThan(10);
  const remaining = generated.flatMap((file) =>
    nodes(parse(fixture.read(file)), ts.isIdentifier)
      .filter((node) => /^(?:posts?(?=[A-Z_]|$)|POST(?=_|$))|Posts?(?=[A-Z_]|$)/.test(node.text))
      .map((node) => `${file}:${node.text}`),
  );
  expect(remaining).toEqual([]);
});
it("controller import와 operations·index export의 바뀐 이름이 서로 일치한다", async () => {
  await genModule(fixture.root, "fixture-widgets");
  const expected = [
    "listFixtureWidgets",
    "getFixtureWidget",
    "createFixtureWidget",
    "updateFixtureWidget",
    "deleteFixtureWidget",
  ];
  const operation = parse(fixture.read("src/modules/fixture-widgets/operations.ts"));
  const exported = nodes(operation, ts.isVariableStatement)
    .filter((node) =>
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
    )
    .flatMap((node) =>
      node.declarationList.declarations.map((declaration) => declaration.name.getText(operation)),
    );
  expect(exported).toEqual(["fixtureWidgetReadQuery", ...expected]);
  const controller = parse(fixture.read("src/modules/fixture-widgets/controller.ts"));
  const imported = nodes(controller, ts.isImportDeclaration).find(
    (node) =>
      ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "./operations.js",
  )?.importClause?.namedBindings;
  expect(
    imported && ts.isNamedImports(imported) ? imported.elements.map((node) => node.name.text) : [],
  ).toEqual(expected);
  const index = parse(fixture.read("src/modules/fixture-widgets/index.ts"));
  const exports = nodes(index, ts.isExportSpecifier).map((node) => node.name.text);
  expect(exports.includes("listFixtureWidgets")).toBe(true);
  expect(exports.includes("seedFixtureWidgets")).toBe(true);
  expect(nodes(operation, ts.isStringLiteral).filter((node) => node.text === "POST")).toHaveLength(
    1,
  );
});
it("서로 다른 두 모듈의 seed export를 충돌 없이 실제로 호출한다", async () => {
  for (const name of ["fixture-widgets", "fixture-blog-entries"])
    await genModule(fixture.root, name);
  const load = fixtureLoader(fixture.root);
  const effects: string[] = [];
  for (const [name, exported, delegate] of [
    ["fixture-widgets", "seedFixtureWidgets", "fixtureWidget"],
    ["fixture-blog-entries", "seedFixtureBlogEntries", "fixtureBlogEntry"],
  ] as const) {
    const module = load(`src/modules/${name}/seed.ts`) as Record<
      string,
      (tx: unknown, id: string) => Promise<void>
    >;
    expect(Object.keys(module)).toEqual([exported]);
    const seed = module[exported];
    if (!seed) throw new Error("생성 seed export가 없다");
    await seed(
      {
        [delegate]: {
          count: () => Promise.resolve(0),
          createMany: (input: { data: unknown[] }) => {
            effects.push(`${name}:${String(input.data.length)}`);
            return Promise.resolve();
          },
        },
      },
      "author",
    );
  }
  expect(effects).toEqual(["fixture-widgets:3", "fixture-blog-entries:3"]);
});
it("이름과 무관한 식별자·HTTP POST·다른 문자열은 보존하면서 camel 구간을 치환한다", () => {
  const source =
    'export const listPosts = 1, getPost = 2, seedPosts = 3, PostgreSQL = 4, listPostgres = 5, posting = 6, compost = 7; export const method = "POST";';
  const transformed = parse(renameGolden(source, moduleNames("fixture-widgets")));
  expect(
    nodes(transformed, ts.isVariableDeclaration).map((node) => node.name.getText(transformed)),
  ).toEqual([
    "listFixtureWidgets",
    "getFixtureWidget",
    "seedFixtureWidgets",
    "PostgreSQL",
    "listPostgres",
    "posting",
    "compost",
    "method",
  ]);
  expect(nodes(transformed, ts.isStringLiteral).map((node) => node.text)).toEqual(["POST"]);
});
it("치환 결과에 Post 구간이 있어도 같은 식별자를 두 번 바꾸지 않는다", () => {
  const source = "export const PostsService = 1, postReadQuery = 2, listPosts = 3;";
  const transformed = parse(renameGolden(source, moduleNames("post-categories")));
  expect(
    nodes(transformed, ts.isVariableDeclaration).map((node) => node.name.getText(transformed)),
  ).toEqual(["PostCategoriesService", "postCategoryReadQuery", "listPostCategories"]);
  const literals = parse(
    renameGolden(
      '["Posts_list", "PostDocument", "POST", "PostgreSQL", "posts", "post.invalid_transition"]',
      moduleNames("post-categories"),
    ),
  );
  expect(nodes(literals, ts.isStringLiteral).map((node) => node.text)).toEqual([
    "PostCategories_list",
    "PostCategoryDocument",
    "POST",
    "PostgreSQL",
    "post-categories",
    "post-category.invalid_transition",
  ]);
});
