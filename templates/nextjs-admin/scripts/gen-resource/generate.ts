import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { format } from "prettier";
import ts from "typescript";
import { parse } from "yaml";
import { resolveContractPaths } from "../gen-config.mjs";
import { readWebOpenapi } from "../gen-input";
import { draftResource, validateType } from "./draft";
import { object } from "./schema";
export { draftResource } from "./draft";

function checkPath(root: string, path: string) {
  let target = root;
  for (const part of path.split("/")) {
    target = join(target, part);
    const entry = lstatSync(target, { throwIfNoEntry: false });
    if (entry?.isSymbolicLink())
      throw new Error(`${path}: 링크 경로 — 프로젝트 안의 일반 파일·폴더로 바꾼다.`);
    if (target !== join(root, ...path.split("/")) && entry && !entry.isDirectory())
      throw new Error(`${path}: 부모가 폴더가 아니다 — 경로 충돌을 정리한다.`);
  }
  return target;
}
function register(source: string, type: string) {
  const file = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const variable = file.statements
    .flatMap((statement) =>
      ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [],
    )
    .find(
      (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "resources",
    );
  let array = variable?.initializer;
  while (
    array &&
    (ts.isAsExpression(array) ||
      ts.isSatisfiesExpression(array) ||
      ts.isParenthesizedExpression(array))
  )
    array = array.expression;
  if (!array || !ts.isArrayLiteralExpression(array))
    throw new Error("src/resources/index.ts: 등록 배열 없음 — resources를 배열 리터럴로 선언한다.");
  const modulePath = `./${type}/resource`;
  if (
    file.statements.some(
      (statement) =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === modulePath,
    )
  )
    throw new Error(`${type}: 이미 등록된 리소스 — 기존 선언을 수정하거나 다른 type을 쓴다.`);
  const used = new Set<string>();
  function visit(node: ts.Node) {
    if (ts.isIdentifier(node)) used.add(node.text);
    ts.forEachChild(node, visit);
  }
  visit(file);
  const name =
    type.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase()) + "Resource";
  let alias = name;
  for (let suffix = 2; used.has(alias); suffix++) alias = `${name}${suffix}`;
  const last = array.elements.at(-1);
  const edits = [
    { at: array.end - 1, value: ` ${alias}` },
    ...(last && !array.elements.hasTrailingComma ? [{ at: last.end, value: "," }] : []),
    { at: 0, value: `import ${alias} from ${JSON.stringify(modulePath)};\n` },
  ].sort((a, b) => b.at - a.at);
  for (const edit of edits) source = source.slice(0, edit.at) + edit.value + source.slice(edit.at);
  return source;
}
export async function generateResource(appRoot: string, type: string) {
  validateType(type);
  const root = resolve(appRoot);
  const destination = checkPath(root, `src/resources/${type}`);
  if (lstatSync(destination, { throwIfNoEntry: false }))
    throw new Error(`${type}: 리소스 폴더가 이미 있다 — 기존 선언을 수정하거나 다른 type을 쓴다.`);
  const registryPath = checkPath(root, "src/resources/index.ts");
  const catalogs = ["ko", "en"].map((locale) => {
    const path = checkPath(root, `messages/${locale}.json`);
    let catalog: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object")
        throw new Error("문구는 객체여야 한다.");
      catalog = object(parsed);
    } catch {
      throw new Error(`messages/${locale}.json: 문구 JSON 오류 — JSON 객체로 고친다.`);
    }
    if (
      catalog.resources !== undefined &&
      (catalog.resources === null ||
        Array.isArray(catalog.resources) ||
        typeof catalog.resources !== "object")
    )
      throw new Error(`${locale}: resources 문구 형식 오류 — 객체로 선언한다.`);
    if (Object.hasOwn(object(catalog.resources), type))
      throw new Error(
        `${locale}: resources.${type} 문구가 이미 있다 — 기존 문구를 정리하거나 다른 type을 쓴다.`,
      );
    return { path, catalog };
  });
  const registry = await format(register(readFileSync(registryPath, "utf8"), type), {
    parser: "typescript",
    printWidth: 100,
  });
  const paths = resolveContractPaths(root);
  const spec = parse(readWebOpenapi(root, readFileSync(paths.openapi, "utf8")));
  const draft = await draftResource(spec, type);
  const messages = await Promise.all(
    catalogs.map(async ({ path, catalog }) => ({
      path,
      source: await format(
        JSON.stringify({
          ...catalog,
          resources: { ...object(catalog.resources), [type]: draft.messages },
        }),
        { parser: "json", printWidth: 100 },
      ),
    })),
  );
  // 입력과 충돌 검사를 모두 마친 뒤에만 파일을 쓴다.
  mkdirSync(destination);
  const declarationPath = join(destination, "resource.ts");
  writeFileSync(declarationPath, draft.source, { flag: "wx" });
  for (const message of messages) writeFileSync(message.path, message.source);
  writeFileSync(registryPath, registry);
  return [declarationPath, ...messages.map(({ path }) => path), registryPath].map((path) =>
    path.slice(root.length + sep.length),
  );
}
