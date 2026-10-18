import type * as fileFixture from "../../../src/modules/files/tests/fixtures.js";
import type * as userFixture from "../../../src/modules/users/tests/fixtures.js";
import type * as postFixture from "../../../src/modules/posts/tests/fixtures.js";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as files from "../../../src/modules/files/index.js";
import * as users from "../../../src/modules/users/index.js";
import * as posts from "../../../src/modules/posts/index.js";
import * as auth from "../../../src/modules/auth/index.js";
import * as roles from "../../../src/modules/roles/index.js";
import * as realtime from "../../../src/modules/realtime/index.js";
import * as errors from "../../../src/core/jsonapi/errors.js";
import { fixtureLoader, type generatorFixture } from "./generated-module.js";
import { nodes, parse } from "./generated-oracles.js";

/** 사본의 파일 정책·메모리 fixture만 평가하며 앱·인프라는 실행하지 않는다. */
export function generatedMemory(fixture: ReturnType<typeof generatorFixture>) {
  const aliases: Record<string, unknown> = {
    "src/modules/users/schemas.ts": users,
    "src/modules/posts/index.ts": posts,
    "src/modules/auth/index.ts": auth,
    "src/modules/roles/index.ts": roles,
    "src/modules/realtime/index.ts": realtime,
    "src/core/jsonapi/errors.ts": errors,
  };
  const load = fixtureLoader(fixture.root, aliases);
  aliases["src/modules/files/schemas.ts"] = {
    ...files,
    ...(load("src/modules/files/service.ts") as object),
    ...(load("src/modules/files/repository.ts") as object),
  };
  const policy = load("src/modules/files/policies.ts") as {
    registerFileReadRule: typeof files.registerFileReadRule;
  };
  const registry = parse(fixture.read("src/modules/registry.ts"));
  const bindings: Record<string, unknown> = {
    UsersRepository: users.UsersRepository,
    PostsRepository: posts.PostsRepository,
  };
  for (const statement of nodes(registry, ts.isImportDeclaration)) {
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const path = statement.moduleSpecifier.text;
    const imports = statement.importClause?.namedBindings;
    if (!imports || !ts.isNamedImports(imports) || !path.startsWith("./")) continue;
    for (const item of imports.elements) {
      if (!item.name.text.endsWith("Repository") || item.name.text in bindings) continue;
      const module = load(
        `src/modules/${path.slice(2).replace("/index.js", "/repository.ts")}`,
      ) as Record<string, unknown>;
      bindings[item.name.text] = module[item.name.text];
    }
  }
  for (const declaration of nodes(registry, ts.isVariableDeclaration)) {
    if (!declaration.name.getText(registry).endsWith("ReadRule") || !declaration.initializer)
      continue;
    const code = ts.transpileModule(
      `module.exports = ${declaration.initializer.getText(registry)}`,
      { compilerOptions: { target: ts.ScriptTarget.ES2023 } },
    ).outputText;
    const module = { exports: undefined as unknown };
    runInNewContext(code, { ...bindings, module });
    policy.registerFileReadRule(
      module.exports as Parameters<typeof policy.registerFileReadRule>[0],
    );
  }
  return {
    registerFileReadRule: policy.registerFileReadRule,
    files: () => (load("src/modules/files/tests/fixtures.ts") as typeof fileFixture).fixture(),
    users: () => (load("src/modules/users/tests/fixtures.ts") as typeof userFixture).fixture(),
    posts: () => (load("src/modules/posts/tests/fixtures.ts") as typeof postFixture).fixture(),
  };
}
