import { relative } from "node:path";

export default {
  meta: {
    type: "problem",
    schema: [],
    messages: { direct: "process.env를 직접 읽는 대신 core/config의 설정을 주입한다" },
  },
  create(context) {
    const root = context.settings["boundaries/root-path"] ?? context.cwd;
    const file = relative(root, context.filename).replaceAll("\\", "/");
    if (file.startsWith("src/core/config/")) return {};
    return {
      MemberExpression(node) {
        const name =
          node.computed && node.property.type === "Literal"
            ? node.property.value
            : !node.computed && node.property.type === "Identifier"
              ? node.property.name
              : null;
        if (node.object.type === "Identifier" && node.object.name === "process" && name === "env")
          context.report({ node, messageId: "direct" });
      },
    };
  },
};
