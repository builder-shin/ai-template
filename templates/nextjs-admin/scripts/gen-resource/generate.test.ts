import { afterEach, beforeEach, expect, it } from "vitest";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import ts from "typescript";
import { draftResource, generateResource } from "./generate";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const identifier = {
  type: "object",
  properties: { type: { enum: ["users"] }, id: { type: "string" } },
};
const record = {
  allOf: [
    ref("Identity"),
    {
      type: "object",
      properties: {
        attributes: {
          type: "object",
          properties: {
            title: { type: "string" },
            status: { enum: ["draft", "published"] },
            createdAt: { type: "string", format: "date-time" },
            active: { type: "boolean" },
          },
        },
        relationships: {
          type: "object",
          properties: {
            author: { properties: { data: identifier } },
            reviewers: { properties: { data: { type: "array", items: identifier } } },
          },
        },
      },
    },
  ],
};
const content = (schema: unknown) => ({ content: { "application/vnd.api+json": { schema } } });
const write = {
  requestBody: content({
    properties: {
      data: {
        properties: {
          attributes: {
            properties: { title: { type: "string" }, status: { enum: ["draft", "published"] } },
          },
          relationships: {
            properties: {
              reviewers: { properties: { data: { type: "array", items: identifier } } },
            },
          },
        },
      },
    },
  }),
  "x-permission": "posts:manage",
};
function contract() {
  return {
    paths: {
      "/api/v1/articles": {
        parameters: [{ $ref: "#/components/parameters/Search" }],
        get: {
          responses: {
            "200": content({ properties: { data: { type: "array", items: ref("Article") } } }),
          },
          parameters: [
            { name: "filter[status]", in: "query", schema: { enum: ["draft", "published"] } },
            { name: "filter[author]", in: "query", schema: { type: "string" } },
            {
              name: "filter[createdFrom]",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
            { name: "sort", in: "query", schema: { type: "string", default: "-createdAt" } },
            { name: "include", in: "query", schema: { type: "string" } },
            { name: "page[number]", in: "query", schema: { type: "integer" } },
          ],
          "x-jsonapi-sort": ["title", "createdAt"],
          "x-jsonapi-include": ["author"],
          "x-permission": "posts:manage",
        },
        post: write,
      },
      "/api/v1/articles/{id}": {
        get: {},
        patch: write,
        delete: { "x-permission": "posts:manage" },
      },
      "/api/v1/users": {
        get: {
          parameters: [{ name: "filter[q]", in: "query", schema: { type: "string" } }],
          responses: {
            "200": content({
              properties: {
                data: {
                  type: "array",
                  items: {
                    properties: { attributes: { properties: { name: { type: "string" } } } },
                  },
                },
              },
            }),
          },
        },
      },
    },
    components: {
      schemas: {
        Identity: { properties: { type: { enum: ["articles"] }, id: { type: "string" } } },
        Article: record,
      },
      parameters: { Search: { name: "filter[q]", in: "query", schema: { type: "string" } } },
    },
  };
}

it("계약 조각의 속성·관계·쿼리·쓰기 권한을 선언과 문구로 만든다", async () => {
  const draft = await draftResource(contract(), "articles");
  expect(draft.definition.list).toEqual({
    columns: ["title", "status", "createdAt", "active", "author", "reviewers"],
    filters: {
      "filter[q]": "text",
      "filter[status]": "enum",
      "filter[author]": "relation",
      "filter[createdFrom]": "date",
    },
    sort: { fields: ["title", "createdAt"], default: "-createdAt" },
    include: ["author"],
  });
  expect(draft.definition.detail).toEqual({ fields: draft.definition.list.columns });
  expect(draft.definition.create).toEqual({
    permission: "posts:manage",
    fields: { title: "text", status: "enum", reviewers: "relation-many" },
  });
  expect(draft.definition.edit).toEqual(draft.definition.create);
  expect(draft.definition.delete).toEqual({ permission: "posts:manage" });
  expect(draft.definition.fields).toMatchObject({
    status: { kind: "enum", values: ["draft", "published"] },
    author: { kind: "relation", relation: { type: "users", label: "name", search: true } },
    reviewers: { kind: "relation-many" },
  });
  expect(draft.messages.fields).toMatchObject({
    q: "q",
    createdFrom: "createdFrom",
    title: "title",
  });
  expect(draft.messages.enums).toEqual({ status: { draft: "draft", published: "published" } });
  expect(draft.source).toContain('import "server-only"');
  const parsed = ts.createSourceFile("resource.ts", draft.source, ts.ScriptTarget.Latest, true);
  expect((parsed as ts.SourceFile & { parseDiagnostics: unknown[] }).parseDiagnostics).toEqual([]);
});

it("읽기 전용·상세 없는 계약에는 쓰기와 상세를 만들지 않는다", async () => {
  const spec = contract();
  delete (spec.paths["/api/v1/articles"] as { post?: unknown }).post;
  delete (spec.paths as Record<string, unknown>)["/api/v1/articles/{id}"];
  const draft = await draftResource(spec, "articles");
  for (const key of ["detail", "create", "edit", "delete"])
    expect(draft.definition).not.toHaveProperty(key);
});

it("sort 확장이 없으면 속성 후보를 쓰고 sort 쿼리가 없으면 생략한다", async () => {
  const spec = contract();
  delete (spec.paths["/api/v1/articles"].get as { "x-jsonapi-sort"?: unknown })["x-jsonapi-sort"];
  expect((await draftResource(spec, "articles")).definition.list.sort?.fields).toEqual([
    "title",
    "status",
    "createdAt",
    "active",
  ]);
  spec.paths["/api/v1/articles"].get.parameters = spec.paths[
    "/api/v1/articles"
  ].get.parameters.filter((p) => p.name !== "sort");
  expect((await draftResource(spec, "articles")).definition.list).not.toHaveProperty("sort");
});

let root: string;
const temporaryRoot = tmpdir();
function put(path: string, value: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), value);
}
function files(path = root): Record<string, string> {
  return Object.fromEntries(
    readdirSync(path).flatMap((name) => {
      const target = join(path, name);
      return lstatSync(target).isDirectory()
        ? Object.entries(files(target))
        : [[target, readFileSync(target, "utf8")]];
    }),
  );
}
beforeEach(() => {
  root = mkdtempSync(join(temporaryRoot, "aitpl-gen-resource-"));
  put("contract/openapi.yaml", JSON.stringify(contract()));
  mkdirSync(join(root, "contract/mock"));
  mkdirSync(join(root, "contract/typespec"));
  put(
    "src/resources/index.ts",
    'import "server-only";\nimport type { AnyResource } from "../lib/resources/definition";\nimport posts from "./posts/resource";\nexport const resources: readonly AnyResource[] = [posts];\n',
  );
  for (const locale of ["ko", "en"])
    put(
      `messages/${locale}.json`,
      JSON.stringify({ resource: { save: "보존" }, resources: { posts: { title: "글" } } }),
    );
});
afterEach(() => {
  if (dirname(root) === temporaryRoot && basename(root).startsWith("aitpl-gen-resource-"))
    rmSync(root, { recursive: true, force: true });
});

it("기존 등록 순서와 문구를 보존하며 새 초안을 함께 등록한다", async () => {
  expect(await generateResource(root, "articles")).toEqual([
    "src/resources/articles/resource.ts",
    "messages/ko.json",
    "messages/en.json",
    "src/resources/index.ts",
  ]);
  const registry = readFileSync(join(root, "src/resources/index.ts"), "utf8");
  expect(registry).toContain('from "./articles/resource"');
  expect(registry).toMatch(/\[posts, articlesResource\]/);
  for (const locale of ["ko", "en"]) {
    const catalog = JSON.parse(readFileSync(join(root, `messages/${locale}.json`), "utf8"));
    expect(catalog.resources.posts).toEqual({ title: "글" });
    expect(catalog.resources.articles.enums.status.draft).toBe("draft");
    expect(catalog.resource.save).toBe("보존");
  }
  expect(readFileSync(join(root, "src/resources/articles/resource.ts"), "utf8")).toContain(
    'type: "articles"',
  );
});

it("설정으로 고른 백엔드 스펙을 읽는다", async () => {
  put("gen.config.json", JSON.stringify({ openapi: "api.json" }));
  put("api.json", JSON.stringify(contract()));
  put("contract/openapi.yaml", "{}");
  await generateResource(root, "articles");
  expect(files()).toHaveProperty(join(root, "src/resources/articles/resource.ts"));
});
it.for([[], ["articles", "extra"], ["--unknown"]])(
  "생성기 CLI의 사용법 오류는 종료 코드 2이며 파일을 쓰지 않는다: %j",
  (args) => {
    const before = files();
    const result = spawnSync(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/gen-resource/cli.ts"), ...args],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("리소스 type이 필요하다 —");
    expect(files()).toEqual(before);
  },
);
it("리소스 출력 경로의 링크는 문구·등록·대상 파일을 쓰기 전에 거절한다", async () => {
  const outside = join(root, "outside");
  mkdirSync(outside);
  const saved = ["src/resources/index.ts", "messages/ko.json", "messages/en.json"].map((path) =>
    readFileSync(join(root, path), "utf8"),
  );
  symlinkSync(
    outside,
    join(root, "src/resources/articles"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(generateResource(root, "articles")).rejects.toThrow("링크 경로 —");
  expect(readdirSync(outside)).toEqual([]);
  expect(
    ["src/resources/index.ts", "messages/ko.json", "messages/en.json"].map((path) =>
      readFileSync(join(root, path), "utf8"),
    ),
  ).toEqual(saved);
});

it.for(["../articles", "Articles", "missing"])(
  "잘못된 type이나 목록 없는 type을 쓰기 전에 거절한다: %s",
  async (type) => {
    const before = files();
    await expect(generateResource(root, type)).rejects.toThrow(/—/);
    expect(files()).toEqual(before);
  },
);
it.for([
  "resource",
  "messages",
  "registry",
  "invalid-messages",
  "invalid-registry",
  "array-catalog",
])("기존 자료나 잘못된 입력이 있으면 아무것도 쓰지 않는다: %s", async (reason) => {
  if (reason === "resource") put("src/resources/articles/resource.ts", "기존 선언");
  if (reason === "messages") put("messages/en.json", '{"resources":{"articles":{"title":"기존"}}}');
  if (reason === "registry")
    put(
      "src/resources/index.ts",
      'import articles from "./articles/resource"; export const resources = [articles];',
    );
  if (reason === "invalid-messages") put("messages/en.json", "{");
  if (reason === "array-catalog") put("messages/en.json", "[]");
  if (reason === "invalid-registry")
    put("src/resources/index.ts", "export const resources = makeRegistry();");
  const before = files();
  await expect(generateResource(root, "articles")).rejects.toThrow(/—/);
  expect(files()).toEqual(before);
});
