import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import ts from "typescript";
import { draftResource } from "./generate";
import { missingResourceMessages } from "../../src/lib/resources/messages";
import type { AnyResource } from "../../src/lib/resources/definition";

it("현재 플랫폼 계약의 초안 다섯 개가 선언 타입과 문구 검사를 통과한다", async () => {
  const spec = parse(readFileSync("contract/openapi.yaml", "utf8"));
  const types = ["posts", "users", "roles", "permissions", "audit-logs"];
  const drafts = await Promise.all(types.map((type) => draftResource(spec, type)));
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
  // 사용자·역할·권한·감사 로그는 제품 registry에 등록하지 않는다.
  expect(readFileSync("src/resources/index.ts", "utf8")).not.toContain("./users/resource");
}, 15000);
