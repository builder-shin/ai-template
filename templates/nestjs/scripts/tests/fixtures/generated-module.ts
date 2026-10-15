import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";
import ts from "typescript";

export function generatorFixture(sourceRoot = process.cwd()) {
  const root = mkdtempSync(join(tmpdir(), "aitpl-module-fixture-"));
  for (const folder of ["src", "prisma"])
    cpSync(join(sourceRoot, folder), join(root, folder), {
      recursive: true,
      filter: (path) => !["generated", "node_modules"].includes(basename(path)),
    });
  mkdirSync(join(root, "scripts/tests"), { recursive: true });
  cpSync(
    join(sourceRoot, "scripts/tests/gen-bootstrap.test.ts"),
    join(root, "scripts/tests/gen-bootstrap.test.ts"),
  );
  mkdirSync(join(root, "tests/integration"), { recursive: true });
  for (const file of ["audit-logs.test.ts", "permissions.test.ts", "seed.test.ts"])
    cpSync(join(sourceRoot, "tests/integration", file), join(root, "tests/integration", file));
  return {
    root,
    close: () => {
      rmSync(root, { recursive: true, force: true });
    },
    read: (path: string) => readFileSync(join(root, path), "utf8"),
  };
}
/** 설치·서버 실행 없이 생성한 순수 모듈과 실제 exporter를 별도 모듈 캐시에서 평가한다. */
export function fixtureLoader(root: string, aliases: Record<string, unknown> = {}) {
  const nativeRequire = createRequire(import.meta.url);
  const cache = new Map<string, { exports: unknown }>();
  function load(path: string): unknown {
    const file = resolve(root, path);
    if (Object.hasOwn(aliases, path)) return aliases[path];
    const cached = cache.get(file);
    if (cached) return cached.exports;
    if (!existsSync(file)) throw new Error(`fixture 모듈이 없다: ${path}`);
    const module = { exports: {} as unknown };
    cache.set(file, module);
    const source = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2023,
        experimentalDecorators: true,
      },
    }).outputText;
    const require = (specifier: string): unknown => {
      if (!specifier.startsWith(".")) return nativeRequire(specifier) as unknown;
      const target = resolve(dirname(file), specifier).replace(/\.js$/, ".ts");
      const relative = target.slice(root.length + 1).replaceAll("\\", "/");
      if (relative === "src/modules/users/index.ts") return load("src/modules/users/schemas.ts");
      if (relative === "src/modules/files/index.ts") return load("src/modules/files/schemas.ts");
      return load(relative);
    };
    runInNewContext(
      source,
      { module, exports: module.exports, require, Buffer, URL, TextEncoder, TextDecoder },
      { filename: file },
    );
    return module.exports;
  }
  return load;
}

export function expectedPermissions(source: string): string[] {
  const parsed = ts.createSourceFile("expected.ts", source, ts.ScriptTarget.Latest, true);
  let expected: string[] | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      /PermissionCode\?\.enum\)\.toEqual$/.test(node.expression.getText(parsed))
    ) {
      const array = node.arguments[0];
      if (
        !array ||
        !ts.isArrayLiteralExpression(array) ||
        !array.elements.every(ts.isStringLiteral)
      )
        throw new Error("권한의 독립적인 예상 literal이 없다");
      expected = array.elements.map((value) => (value as ts.StringLiteral).text);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (!expected) throw new Error("권한의 엄격한 예상 목록을 찾지 못했다");
  return expected;
}

export function expectedChannels(source: string): { name: string; permission: string | null }[] {
  const parsed = ts.createSourceFile("channels.ts", source, ts.ScriptTarget.Latest, true);
  const values: { name: string; permission: string | null }[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === "defineRealtimeChannel") {
      const [name, permission] = node.arguments;
      if (
        !name ||
        !ts.isStringLiteral(name) ||
        !permission ||
        (!ts.isStringLiteral(permission) && permission.kind !== ts.SyntaxKind.NullKeyword)
      )
        throw new Error("채널 fixture가 literal이 아니다");
      values.push({
        name: name.text,
        permission: ts.isStringLiteral(permission) ? permission.text : null,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return values;
}
