import ts from "typescript";
import { resolve } from "node:path";
import { expect, it } from "vitest";

function diagnostics(source: string, verbatimModuleSyntax: boolean): readonly ts.Diagnostic[] {
  const directory = resolve(".cache/type-imports");
  const entry = resolve(directory, "consumer.ts");
  const files = new Map([
    [entry, source],
    [resolve(directory, "dependency.ts"), "export interface Dependency { read(): string }"],
  ]);
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2023,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    isolatedModules: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    verbatimModuleSyntax,
  };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  const getSource = host.getSourceFile.bind(host);
  const directoryExists = host.directoryExists?.bind(host);
  host.readFile = (file) => files.get(file) ?? read(file);
  host.fileExists = (file) => files.has(file) || exists(file);
  host.directoryExists = (path) => path === directory || (directoryExists?.(path) ?? false);
  host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => {
    const content = files.get(file);
    return content === undefined
      ? getSource(file, languageVersion, onError, shouldCreateNewSourceFile)
      : ts.createSourceFile(file, content, ts.ScriptTarget.ES2023, true);
  };
  return ts.getPreEmitDiagnostics(ts.createProgram([entry], options, host));
}

it("TS1272 rejects a value import of an interface used in a decorated constructor", () => {
  const valueImport = 'import { Dependency } from "./dependency.js";\n';
  const constructor =
    "function decorator(): ClassDecorator { return () => undefined; }\n" +
    "@decorator() export class Consumer { constructor(readonly dependency: Dependency) {} }\n";
  expect(diagnostics(valueImport + constructor, false).map((item) => item.code)).toContain(1272);
  expect(diagnostics(valueImport + constructor, true).map((item) => item.code)).toContain(1484);
  expect(diagnostics(valueImport.replace("import {", "import type {") + constructor, true)).toEqual(
    [],
  );
});
