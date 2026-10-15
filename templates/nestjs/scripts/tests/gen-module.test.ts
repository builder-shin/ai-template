import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, beforeEach, expect, it } from "vitest";
import { genModule } from "../gen-module.js";
import { generatorFixture } from "./fixtures/generated-module.js";

let root: string;
let fixture: ReturnType<typeof generatorFixture>;
const read = (path: string) => readFileSync(join(root, path), "utf8");
beforeEach(() => {
  fixture = generatorFixture();
  root = fixture.root;
});
afterEach(() => {
  fixture.close();
});
it("posts를 fixture-widgets로 복사하고 등록·권한·이벤트·모델을 더한다", async () => {
  const changed = await genModule(root, "fixture-widgets");
  expect(changed).toEqual(
    expect.arrayContaining([
      "src/modules/fixture-widgets/service.ts",
      "src/modules/registry.ts",
      "prisma/schema.prisma",
    ]),
  );
  expect(read("src/modules/fixture-widgets/service.ts")).not.toMatch(/\bposts?\b|\bPosts?\b/);
  expect(read("src/modules/fixture-widgets/controller.ts")).toContain("FixtureWidgetsController");
  expect(read("src/modules/fixture-widgets/repository.ts")).toContain(
    "tx.fixtureWidget.findUnique",
  );
  expect(read("src/modules/fixture-widgets/tests/policies.test.ts")).toContain("canModify");
  expect(read("src/app.module.ts")).toContain(
    "FixtureWidgetsModule.register(infrastructure, [files, realtime])",
  );
  expect(read("src/modules/registry.ts")).toContain(
    "new FixtureWidgetsRepository().readableCoverIds",
  );
  expect(read("src/core/security/permissions.ts")).toContain('"fixture-widgets:manage"');
  expect(read("src/modules/roles/permissions.ts")).toContain('"fixture-widgets:create":');
  expect(read("src/core/realtime/declarations.ts")).toContain('"fixture-widget.created"');
  expect(read("src/modules/realtime/schemas.ts")).toContain(
    'defineRealtimeChannel("fixture-widgets:all", "fixture-widgets:manage")',
  );
  expect(read("prisma/schema.prisma")).toMatch(/model FixtureWidget\s*\{/);
  expect(read("prisma/schema.prisma")).toMatch(/fixtureWidgets\s+FixtureWidget\[\]/);
  expect(read("prisma/schema.prisma")).toContain('@@map("fixture_widgets")');
});
it("생성한 정책이 작성자와 관리자 권한을 실제 구분한다", async () => {
  await genModule(root, "fixture-widgets");
  const load = (file: string): Record<string, (...args: unknown[]) => unknown> => {
    const exports = {};
    const source = ts.transpileModule(read(`src/modules/fixture-widgets/${file}.ts`), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    runInNewContext(source, { exports, require: () => load("permissions") });
    return exports;
  };
  const policy = load("policies");
  const item = { authorId: "owner", status: "draft" };
  expect(
    policy.canModify?.(item, { userId: "other", permissions: new Set(["fixture-widgets:manage"]) }),
  ).toBe(true);
  expect(
    policy.canModify?.(item, { userId: "other", permissions: new Set(["posts:manage"]) }),
  ).toBe(false);
  expect(policy.canSee?.(item, undefined)).toBe(false);
});
it("kebab 복수형에서 파일 이름과 PascalCase 모델을 만든다", async () => {
  await genModule(root, "fixture-blog-entries");
  expect(read("src/modules/fixture-blog-entries/fixture-blog-entries.module.ts")).toContain(
    "FixtureBlogEntriesModule",
  );
  expect(read("prisma/schema.prisma")).toContain("model FixtureBlogEntry {");
  expect(read("src/modules/fixture-blog-entries/repository.ts")).toContain(
    "tx.fixtureBlogEntry.findUnique",
  );
});
it.each([
  "widget",
  "FixtureWidgets",
  "../fixture-widgets",
  "fixture-widgets/extra",
  "",
  "fixture-widgets--items",
])("잘못된 이름은 쓰기 전에 거절한다: %s", async (name) => {
  const before = read("prisma/schema.prisma");
  await expect(genModule(root, name)).rejects.toThrow("소문자 kebab 복수형");
  expect(read("prisma/schema.prisma")).toBe(before);
});
it("기존 모듈은 덮어쓰지 않고 등록부도 유지한다", async () => {
  const before = read("prisma/schema.prisma");
  await expect(genModule(root, "posts")).rejects.toThrow("이미");
  expect(read("prisma/schema.prisma")).toBe(before);
});
it("중앙 등록의 충돌도 파일을 만들기 전에 거절한다", async () => {
  writeFileSync(
    join(root, "prisma/schema.prisma"),
    read("prisma/schema.prisma") + "\nmodel FixtureWidget {\n id String @id\n}\n",
  );
  const before = read("src/app.module.ts");
  await expect(genModule(root, "fixture-widgets")).rejects.toThrow("이미");
  expect(existsSync(join(root, "src/modules/fixture-widgets"))).toBe(false);
  expect(read("src/app.module.ts")).toBe(before);
});
