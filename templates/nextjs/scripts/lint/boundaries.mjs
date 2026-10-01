import boundaries from "eslint-plugin-boundaries";

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
    plugins: { boundaries, template: { rules: { "server-only": serverOnly } } },
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
