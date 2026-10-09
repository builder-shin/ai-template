import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import ts from "typescript";
import { draftResource } from "./generate";
import { missingResourceMessages } from "../../src/lib/resources/messages";
import type { AnyResource } from "../../src/lib/resources/definition";
import { resources as productResources } from "../../src/resources";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";

it("현재 플랫폼 계약의 초안 다섯 개가 선언 타입과 문구 검사를 통과한다", async () => {
  const spec = parse(readFileSync("contract/openapi.yaml", "utf8"));
  const types = ["posts", "users", "roles", "permissions", "audit-logs"];
  const drafts = await Promise.all(types.map((type) => draftResource(spec, type)));
  const role = drafts.find((draft) => draft.definition.type === "roles")!;
  expect(role.definition.fields.permissions).toMatchObject({
    kind: "enum-many",
    values: expect.arrayContaining(["roles:read", "posts:manage"]),
  });
  expect(role.definition.create?.fields.permissions).toBe("enum-many");
  expect(role.definition.edit?.fields.permissions).toBe("enum-many");
  expect(
    drafts.find((draft) => draft.definition.type === "users")?.definition.fields.avatar,
  ).toEqual({ kind: "file", relation: { type: "files", label: "filename" } });
  const files = new Map(
    drafts.map((draft) => [
      resolve(`src/resources/__draft-${draft.definition.type}/resource.ts`).replaceAll("\\", "/"),
      draft.source,
    ]),
  );
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2023,
    jsx: ts.JsxEmit.Preserve,
    types: ["node"],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile;
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) => {
    const source = files.get(resolve(path).replaceAll("\\", "/"));
    return source === undefined
      ? getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile)
      : ts.createSourceFile(path, source, languageVersion, true);
  };
  const program = ts.createProgram([...files.keys()], options, host);
  expect(
    ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
  ).toEqual([]);
  const resources = drafts.map((draft) => draft.definition) as unknown as AnyResource[];
  const catalog = {
    resources: Object.fromEntries(drafts.map((draft) => [draft.definition.type, draft.messages])),
  };
  expect(missingResourceMessages(resources, { ko: catalog, en: catalog })).toEqual([]);
  // 세션은 관리 리소스로 등록하지 않는다.
  expect(readFileSync("src/resources/index.ts", "utf8")).not.toContain("./sessions/resource");
}, 15000);

it("제품 리소스 다섯 개는 등록 순서와 양쪽 카탈로그 문구를 갖춘다", () => {
  expect(productResources.map((resource) => resource.type)).toEqual([
    "posts",
    "users",
    "roles",
    "permissions",
    "audit-logs",
  ]);
  expect(missingResourceMessages(productResources, { ko, en })).toEqual([]);
});
