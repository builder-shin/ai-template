import { dirname, relative, resolve } from "node:path";

export default {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      boundary: "생성 Prisma는 repository.ts·core/db에서만 가져오고 서비스에는 저장소를 주입한다",
    },
  },
  create(context) {
    const root = context.settings["boundaries/root-path"] ?? context.cwd;
    const file = relative(root, context.filename).replaceAll("\\", "/");
    const allowed = file.startsWith("src/core/db/") || /(?:^|\/)repository\.ts$/.test(file);
    function check(node, source) {
      if (typeof source !== "string") return;
      const target = relative(root, resolve(dirname(context.filename), source)).replaceAll(
        "\\",
        "/",
      );
      if (
        !allowed &&
        (target.startsWith("src/generated/") ||
          /(?:^|\/)generated\//.test(source) ||
          source === "@prisma/client")
      )
        context.report({ node, messageId: "boundary" });
    }
    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
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
    };
  },
};
