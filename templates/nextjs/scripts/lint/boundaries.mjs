import boundaries from "eslint-plugin-boundaries";
import { dirname, resolve } from "node:path";

/** @type {import("eslint").Rule.RuleModule} */
const testSupport = {
  meta: {
    type: "problem",
    schema: [],
    messages: { forbidden: "테스트 지원은 테스트와 fixture에서만 가져온다." },
  },
  create(context) {
    const path = context.filename.replaceAll("\\", "/");
    if (/\.(test|spec)\.[cm]?tsx?$|(?:^|[/\-])fixture\.[cm]?tsx?$|\/lib\/testing\//.test(path))
      return {};
    function check(node) {
      const source = node.source;
      if (!source || typeof source.value !== "string") return;
      const target = source.value.startsWith("@/")
        ? `/src/${source.value.slice(2)}`
        : resolve(dirname(context.filename), source.value).replaceAll("\\", "/");
      if (/\/src\/lib\/testing(?:\/|$)/.test(target))
        context.report({ node: source, messageId: "forbidden" });
    }
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

/** @type {import("eslint").Rule.RuleModule} */
const serverOnly = {
  meta: {
    type: "problem",
    schema: [],
    messages: { required: '서버 파일에는 import "server-only"를 더하고 "use client"를 지운다.' },
  },
  create(context) {
    return {
      Program(node) {
        const path = context.filename.replaceAll("\\", "/");
        if (/\.(test|spec)\.|\.d\.ts$|\/generated\//.test(path)) return;
        if (
          !/\/src\/(?:lib\/(?:api|session)\/|features\/[^/]+\/(?:actions|queries)\.tsx?$)/.test(
            path,
          )
        )
          return;
        const marked = node.body.some(
          (entry) =>
            entry.type === "ImportDeclaration" &&
            entry.source.value === "server-only" &&
            entry.specifiers.length === 0 &&
            entry.importKind !== "type",
        );
        const client = node.body.some(
          (entry) => entry.type === "ExpressionStatement" && entry.directive === "use client",
        );
        if (!marked || client) context.report({ node, messageId: "required" });
      },
    };
  },
};

/** @returns {import("eslint").Linter.Config} */
export function architectureConfig(root) {
  return {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      boundaries,
      template: { rules: { "server-only": serverOnly, "test-support": testSupport } },
    },
    settings: {
      "boundaries/root-path": root,
      "boundaries/elements": [
        { type: "messages", pattern: "messages" },
        { type: "feature", pattern: "src/features/*", capture: ["name"] },
        { type: "app", pattern: "src/app" },
        { type: "lib", pattern: "src/lib" },
        { type: "components", pattern: "src/components" },
      ],
      "import/resolver": {
        typescript: { project: `${root}/tsconfig.json` },
        node: { extensions: [".ts", ".tsx", ".js"] },
      },
    },
    rules: {
      "template/server-only": "error",
      "template/test-support": "error",
      "boundaries/no-unknown-dependencies": "error",
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              disallow: { to: { element: { type: "feature", fileInternalPath: "!index.ts" } } },
              message: "다른 기능은 공개 index.ts로 가져온다.",
            },
            {
              dependency: { relationship: { to: "internal" } },
              allow: { to: { element: { type: "feature" } } },
            },
            {
              from: { element: { types: { anyOf: ["lib", "components"] } } },
              disallow: { to: { element: { types: { anyOf: ["feature", "app"] } } } },
              message: "공통 코드는 app이나 기능에 의존하지 않는다.",
            },
          ],
        },
      ],
    },
  };
}
