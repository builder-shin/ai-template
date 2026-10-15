import "reflect-metadata";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, beforeEach, expect, it } from "vitest";
import { FilesModule, FilesRepository, type FileRecord } from "../../src/modules/files/index.js";
import type { Tx } from "../../src/core/db/unit-of-work.js";
import type { RegisteredComponent } from "../../src/core/jsonapi/schemas.js";
import type { OpenApiDocument } from "../../src/core/jsonapi/openapi/emit.js";
import { genModule } from "../gen-module.js";
import {
  expectedChannels,
  expectedPermissions,
  fixtureLoader,
  generatorFixture,
} from "./fixtures/generated-module.js";

let fixture: ReturnType<typeof generatorFixture>;
beforeEach(() => {
  fixture = generatorFixture();
});
afterEach(() => {
  fixture.close();
});
it("생성한 파일 저장소 설정은 살아 있는 새 표지를 같은 트랜잭션에서 보존한다", async () => {
  await genModule(fixture.root, "fixture-widgets");
  const load = fixtureLoader(fixture.root);
  const { FixtureWidgetsRepository } = load("src/modules/fixture-widgets/repository.ts") as {
    FixtureWidgetsRepository: new () => unknown;
  };
  const app = ts.createSourceFile(
    "app.ts",
    fixture.read("src/app.module.ts"),
    ts.ScriptTarget.Latest,
    true,
  );
  let expression = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(app) === "files")
      expression = node.initializer?.getText(app) ?? "";
    ts.forEachChild(node, visit);
  }
  visit(app);
  const module = runInNewContext(expression, {
    infrastructure: true,
    FilesModule,
    FixtureWidgetsRepository,
  }) as ReturnType<typeof FilesModule.register>;
  const provider = module.providers?.find(
    (value) =>
      value === FilesRepository ||
      (typeof value === "object" && "provide" in value && value.provide === FilesRepository),
  ) as typeof FilesRepository | { useFactory: () => FilesRepository };
  const repository = typeof provider === "function" ? new provider() : provider.useFactory();
  const trace: unknown[] = [];
  const files = new Map<string, FileRecord>(
    ["f1", "f2"].map((id) => [
      id,
      {
        id,
        ownerId: "owner",
        key: id,
        filename: "표지.png",
        contentType: "image/png",
        size: 1n,
        status: "ready",
        createdAt: new Date("2026-10-15T00:00:00Z"),
        detachedAt: new Date(),
      },
    ]),
  );
  const tx = {
    $queryRaw: (_sql: TemplateStringsArray, id: string) => {
      trace.push(["lock", id]);
      return Promise.resolve([]);
    },
    user: { count: () => Promise.resolve(0) },
    post: { count: () => Promise.resolve(0) },
    fixtureWidget: {
      count: (query: unknown) => {
        trace.push(["widget", query]);
        return Promise.resolve(
          (query as { where: { coverImageId: string } }).where.coverImageId === "f1" ? 1 : 0,
        );
      },
    },
    file: {
      findUnique: ({ where }: { where: { id: string } }) => Promise.resolve(files.get(where.id)),
      update: ({ where }: { where: { id: string } }) => {
        const item = files.get(where.id);
        if (item) item.detachedAt = null;
        return Promise.resolve(item);
      },
      delete: ({ where }: { where: { id: string } }) => {
        trace.push(["delete", where.id]);
        files.delete(where.id);
        return Promise.resolve();
      },
    },
  } as unknown as Tx;
  expect((await repository.claimDetached(tx, ["f2", "f1", "f1"])).map((file) => file.id)).toEqual([
    "f2",
  ]);
  expect(files.has("f1")).toBe(true);
  expect(files.get("f1")?.detachedAt).toBeNull();
  expect(trace).toEqual([
    ["lock", "f1"],
    ["widget", { where: { coverImageId: "f1" } }],
    ["lock", "f2"],
    ["widget", { where: { coverImageId: "f2" } }],
    ["delete", "f2"],
  ]);
});
it("새 enum과 이벤트를 실제 OpenAPI exporter가 숨기지 않고 내보낸다", async () => {
  const baseline = expectedPermissions(fixture.read("scripts/tests/gen-bootstrap.test.ts"));
  const channels = expectedChannels(fixture.read("src/modules/realtime/schemas.ts"));
  await genModule(fixture.root, "fixture-widgets");
  const load = fixtureLoader(fixture.root, {
    "src/modules/auth/index.ts": { SESSION_REVOKED_REASONS: ["logout"] },
  });
  load("src/core/security/permissions.ts");
  load("src/core/jsonapi/error-codes.ts");
  load("src/core/audit/actions.ts");
  load("src/modules/fixture-widgets/schemas.ts");
  load("src/modules/fixture-widgets/events.ts");
  load("src/modules/realtime/schemas.ts");
  const { components } = load("src/core/jsonapi/schemas.ts") as {
    components: () => ReadonlyMap<string, RegisteredComponent>;
  };
  const { buildOpenApi } = load("src/core/jsonapi/openapi/emit.ts") as {
    buildOpenApi: (
      operations: [],
      registry: ReadonlyMap<string, RegisteredComponent>,
    ) => OpenApiDocument;
  };
  const doc = buildOpenApi([], components());
  expect(baseline.slice(0, 8)).toEqual([
    "admin:access",
    "users:read",
    "users:manage",
    "roles:read",
    "roles:manage",
    "audit-logs:read",
    "posts:create",
    "posts:manage",
  ]);
  const expected = [...baseline, "fixture-widgets:create", "fixture-widgets:manage"];
  expect(expectedPermissions(fixture.read("scripts/tests/gen-bootstrap.test.ts"))).toEqual(
    expected,
  );
  expect(new Set(expected).size).toBe(expected.length);
  expect(doc.components.schemas.PermissionCode).toMatchObject({ enum: expected });
  expect(doc.components.schemas.ErrorCode).toMatchObject({
    enum: expect.arrayContaining([
      "post.invalid_transition",
      "fixture-widget.invalid_transition",
    ]) as unknown,
  });
  expect(doc.components.schemas.AuditLogAction).toMatchObject({
    enum: expect.arrayContaining([
      "post.deleted_by_admin",
      "fixture-widget.deleted_by_admin",
    ]) as unknown,
  });
  expect(doc.components.schemas.FixtureWidgetResource).toBeDefined();
  expect(doc["x-realtime-events"].map((event) => event.name)).toEqual([
    "fixture-widget.created",
    "fixture-widget.updated",
    "fixture-widget.published",
    "fixture-widget.unpublished",
    "fixture-widget.deleted",
    "session.revoked",
  ]);
  const expectedChannelValues = [
    ...channels,
    { name: "fixture-widgets", permission: null },
    { name: "fixture-widgets:all", permission: "fixture-widgets:manage" },
  ];
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  expect([...doc["x-realtime-channels"]].sort(byName)).toEqual(expectedChannelValues.sort(byName));
  const schema = components().get("PermissionCode")?.schema;
  expect(schema?.safeParse("unknown:manage").success).toBe(false);
});
it("두 번째 모듈도 첫 등록을 보존하고 중복 생성은 쓰기 전에 거절한다", async () => {
  await genModule(fixture.root, "fixture-widgets");
  await genModule(fixture.root, "fixture-gadgets");
  expect(fixture.read("src/core/security/permissions.ts")).toContain('"fixture-widgets:manage"');
  expect(fixture.read("src/core/security/permissions.ts")).toContain('"fixture-gadgets:manage"');
  const before = fixture.read("src/app.module.ts");
  await expect(genModule(fixture.root, "fixture-widgets")).rejects.toThrow("이미");
  expect(fixture.read("src/app.module.ts")).toBe(before);
});
it("생성한 작업 사본의 엄격한 시드·채널 예상 fixture도 새 선언을 검증한다", async () => {
  const expected = [
    ...expectedPermissions(fixture.read("scripts/tests/gen-bootstrap.test.ts")),
    "fixture-widgets:create",
    "fixture-widgets:manage",
  ];
  const channels = [
    ...expectedChannels(fixture.read("src/modules/realtime/schemas.ts")),
    { name: "fixture-widgets", permission: null },
    { name: "fixture-widgets:all", permission: "fixture-widgets:manage" },
  ];
  await genModule(fixture.root, "fixture-widgets");
  function assertion(file: string, matches: (text: string) => boolean): string {
    const source = ts.createSourceFile(
      "fixture.ts",
      fixture.read(file),
      ts.ScriptTarget.Latest,
      true,
    );
    const values: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && matches(node.expression.getText(source)))
        values.push(node.getText(source));
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(values).toHaveLength(1);
    return values[0] ?? "";
  }
  runInNewContext(
    assertion(
      "src/modules/roles/tests/seed.test.ts",
      (text) => text.includes('r.name === "admin"') && text.endsWith(".toHaveLength"),
    ),
    { expect, db: { roles: [{ name: "admin", permissions: expected }] } },
  );
  runInNewContext(
    assertion(
      "src/modules/realtime/tests/module.test.ts",
      (text) => text === 'expect(document["x-realtime-channels"]).toEqual',
    ),
    { expect, document: { "x-realtime-channels": channels } },
  );
});
