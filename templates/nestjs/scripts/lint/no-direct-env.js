import { dirname, relative, resolve } from "node:path";
import ts from "typescript";

const compilerOptions = new Map();
function options(file) {
  const config = ts.findConfigFile(dirname(file), ts.sys.fileExists);
  if (!config) return { moduleResolution: ts.ModuleResolutionKind.NodeNext };
  if (!compilerOptions.has(config)) {
    const input = ts.readConfigFile(config, ts.sys.readFile);
    compilerOptions.set(
      config,
      ts.parseJsonConfigFileContent(input.config, ts.sys, dirname(config)).options,
    );
  }
  return compilerOptions.get(config);
}
export default {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      direct: "process.env를 직접 읽는 대신 core/config의 설정을 주입한다",
      child: "자식 환경 준비 도구는 scripts에서만 가져온다",
    },
  },
  create(context) {
    const root = context.settings["boundaries/root-path"] ?? context.cwd;
    const file = relative(root, context.filename).replaceAll("\\", "/");
    const directAllowed =
      file.startsWith("src/core/config/") || file === "scripts/child-environment.mjs";
    const processes = new Set(["process"]);
    function check(node, source) {
      if (!file.startsWith("src/") || typeof source !== "string") return;
      const targets = [resolve(dirname(context.filename), source)];
      const resolved = ts.resolveModuleName(
        source,
        context.filename,
        options(context.filename),
        ts.sys,
      ).resolvedModule;
      if (resolved) targets.push(resolved.resolvedFileName);
      if (
        targets.some((target) =>
          /^scripts\/child-environment\.(?:mjs|d\.mts)$/.test(
            relative(root, target).replaceAll("\\", "/"),
          ),
        )
      )
        context.report({ node, messageId: "child" });
    }
    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
        if (directAllowed || !["node:process", "process"].includes(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier") {
            const name = specifier.imported.name ?? specifier.imported.value;
            if (name === "env") context.report({ node: specifier, messageId: "direct" });
          } else processes.add(specifier.local.name);
        }
      },
      VariableDeclarator(node) {
        if (
          directAllowed ||
          node.id.type !== "ObjectPattern" ||
          node.init?.type !== "Identifier" ||
          !processes.has(node.init.name)
        )
          return;
        for (const property of node.id.properties) {
          if (property.type === "Property" && (property.key.name ?? property.key.value) === "env")
            context.report({ node: property, messageId: "direct" });
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") check(node, node.source.value);
      },
      MemberExpression(node) {
        if (directAllowed) return;
        const name =
          node.computed && node.property.type === "Literal"
            ? node.property.value
            : !node.computed && node.property.type === "Identifier"
              ? node.property.name
              : null;
        if (node.object.type === "Identifier" && processes.has(node.object.name) && name === "env")
          context.report({ node, messageId: "direct" });
      },
    };
  },
};
