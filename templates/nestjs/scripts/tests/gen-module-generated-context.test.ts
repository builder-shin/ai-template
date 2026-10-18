import "reflect-metadata";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, beforeEach, expect, it } from "vitest";
import { FilesModule, FilesRepository, FilesService } from "../../src/modules/files/index.js";
import { testApp, mediaType, errorDocument } from "../../src/core/http/tests/fixtures.js";
import { PRINCIPAL_RESOLVER } from "../../src/core/security/principal.js";
import { genModule } from "../gen-module.js";
import {
  fixtureLoader,
  generatorFixture,
  generatedReferenceContext,
} from "./fixtures/generated-module.js";
import { generatedMemory } from "./fixtures/generated-context.js";
import { evaluate, nodes, parse } from "./fixtures/generated-oracles.js";

let fixture: ReturnType<typeof generatorFixture>;
beforeEach(() => {
  fixture = generatorFixture();
});
afterEach(() => {
  fixture.close();
});
async function widgetsCaller() {
  if (!existsSync(join(fixture.root, "src/modules/widgets")))
    await genModule(fixture.root, "widgets");
  expect(fixture.read("src/app.module.ts")).toContain("./modules/widgets/index.js");
}
const extraRoutes = (name: string) => [
  { method: "GET", path: `/api/v1/${name}` },
  { method: "POST", path: `/api/v1/${name}` },
  { method: "GET", path: `/api/v1/${name}/:id` },
  { method: "PATCH", path: `/api/v1/${name}/:id` },
  { method: "DELETE", path: `/api/v1/${name}/:id` },
];
function routeOracle() {
  const source = parse(fixture.read("src/core/http/tests/route-audit.test.ts"));
  const calls = nodes(source, ts.isCallExpression);
  const count = calls.find((n) => n.expression.getText(source) === "expect(routes).toHaveLength");
  const expected = calls.find(
    (n) =>
      n.expression.getText(source) === "expect.arrayContaining" &&
      n.arguments[0]?.getText(source).includes("/api/v1/posts"),
  );
  if (!count || !expected?.arguments[0]) throw new Error("독립 라우트 예상값이 없다");
  return {
    count: (routes: unknown[]) => evaluate(count, source, { expect, routes }),
    routes: evaluate(expected.arguments[0], source) as unknown[],
  };
}
it("이미 widgets가 있는 호출자도 outer-fixture-widgets와 fixture-widgets를 정확히 구분한다", async () => {
  await widgetsCaller();
  for (const name of ["outer-fixture-widgets", "fixture-widgets"])
    await genModule(fixture.root, name);
  for (const name of ["widgets", "outer-fixture-widgets", "fixture-widgets"])
    expect(fixture.read("src/app.module.ts")).toContain(`./modules/${name}/index.js`);
  const before = fixture.read("src/app.module.ts");
  await expect(genModule(fixture.root, "fixture-widgets")).rejects.toThrow("이미");
  expect(fixture.read("src/app.module.ts")).toBe(before);
});
it("중앙 등록의 정확한 모듈 토큰 충돌은 부분 이름과 구분하여 쓰기 전에 거절한다", async () => {
  const path = join(fixture.root, "src/app.module.ts");
  writeFileSync(path, fixture.read("src/app.module.ts") + "\nconst FixtureWidgetsModule = null;\n");
  const before = fixture.read("src/app.module.ts");
  await expect(genModule(fixture.root, "fixture-widgets")).rejects.toThrow("이미");
  expect(fixture.read("src/app.module.ts")).toBe(before);
});
it("생성 호출자의 라우트 예상값은 기존 39개와 각 모듈의 독립된 다섯 라우트를 보존한다", async () => {
  const baseline = routeOracle();
  expect(baseline.routes.slice(0, 39)).toHaveLength(39);
  baseline.count(baseline.routes);
  await genModule(fixture.root, "context-widgets");
  let current = routeOracle();
  expect(current.routes).toEqual([...baseline.routes, ...extraRoutes("context-widgets")]);
  current.count([...baseline.routes, ...extraRoutes("context-widgets")]);
  expect(() => current.count(baseline.routes)).toThrow();
  await genModule(fixture.root, "fixture-gadgets");
  current = routeOracle();
  expect(current.routes).toEqual([
    ...baseline.routes,
    ...extraRoutes("context-widgets"),
    ...extraRoutes("fixture-gadgets"),
  ]);
  current.count([
    ...baseline.routes,
    ...extraRoutes("context-widgets"),
    ...extraRoutes("fixture-gadgets"),
  ]);
  expect(() =>
    current.count([...current.routes, { method: "GET", path: "/unexpected" }]),
  ).toThrow();
});
it("이미 생성된 widgets 참조가 있어도 기존 같은 트랜잭션 표지 보호 단언을 실행한다", async () => {
  await widgetsCaller();
  const source = parse(
    readFileSync(new URL("./gen-module-integration.test.ts", import.meta.url), "utf8"),
  );
  const call = nodes(source, ts.isCallExpression).find(
    (n) =>
      n.arguments[0] &&
      ts.isStringLiteral(n.arguments[0]) &&
      n.arguments[0].text ===
        "생성한 파일 저장소 설정은 살아 있는 새 표지를 같은 트랜잭션에서 보존한다",
  );
  if (!call?.arguments[1]) throw new Error("기존 단언 본문이 없다");
  const callback = evaluate(call.arguments[1], source, {
    fixture,
    genModule,
    fixtureLoader,
    generatedReferenceContext,
    ts,
    runInNewContext,
    FilesModule,
    FilesRepository,
    expect,
  }) as () => Promise<void>;
  await callback();
});
it.each(["files", "users", "posts"] as const)(
  "widgets 생성 후 %s 메모리 HTTP는 공개 파일 200·비공개 404·남의 수정 403을 보존한다",
  async (family) => {
    await widgetsCaller();
    const memory = generatedMemory(fixture);
    const f = memory[family]();
    try {
      let id: string;
      let service: FilesService;
      if ("add" in f) {
        id = "01900000-0000-7000-8000-000000000001";
        f.add({ id, ownerId: "other", status: "ready" });
        service = f.service;
      } else if ("users" in f) {
        id = f.state.files[0]?.id ?? "";
        const user = f.state.users[0];
        if (!user) throw new Error("사용자가 없다");
        user.avatarFileId = id;
        service = f.files;
      } else {
        id = f.state.files[0]?.id ?? "";
        const post = f.state.posts[0];
        if (!post) throw new Error("글이 없다");
        post.coverImageId = id;
        post.status = "published";
        service = f.files;
      }
      const { app, http } = await testApp([], {
        providers: [
          {
            provide: PRINCIPAL_RESOLVER,
            useValue: {
              resolve: () =>
                Promise.resolve({ userId: "viewer", sessionId: "s", permissions: new Set() }),
            },
          },
        ],
      });
      const target = app.get(FilesService);
      target.get = service.get.bind(service);
      target.complete = service.complete.bind(service);
      if (family === "files") {
        memory.registerFileReadRule((_tx, _viewer, ids) =>
          Promise.resolve(new Set(ids.filter((candidate) => candidate === id))),
        );
        const response = await http
          .patch("/api/v1/files/" + id)
          .set("Authorization", "Bearer fixture")
          .set("Content-Type", mediaType)
          .send({ data: { type: "files", id } });
        expect(response.status).toBe(403);
        expect(errorDocument(response.text).errors[0]?.code).toBe("permission.denied");
      } else {
        expect((await http.get("/api/v1/files/" + id)).status).toBe(200);
        const denied = await http
          .patch("/api/v1/files/" + id)
          .set("Authorization", "Bearer fixture")
          .set("Content-Type", mediaType)
          .send({ data: { type: "files", id } });
        expect(denied.status).toBe(403);
        expect(errorDocument(denied.text).errors[0]?.code).toBe("permission.denied");
        if ("users" in f) {
          const user = f.state.users[0];
          if (user) user.avatarFileId = null;
        } else if (!("add" in f)) {
          const post = f.state.posts[0];
          if (post) post.status = "draft";
        }
        expect((await http.get("/api/v1/files/" + id)).status).toBe(404);
      }
    } finally {
      f.close();
    }
  },
);
