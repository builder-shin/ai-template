export default {
  meta: {
    type: "problem",
    schema: [],
    messages: { unsafe: "안전하지 않은 SQL 호출 대신 $queryRaw·$executeRaw의 태그 템플릿을 쓴다" },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        const name =
          callee.computed && callee.property.type === "Literal"
            ? callee.property.value
            : !callee.computed && callee.property.type === "Identifier"
              ? callee.property.name
              : null;
        if (name === "$queryRawUnsafe" || name === "$executeRawUnsafe")
          context.report({ node, messageId: "unsafe" });
      },
    };
  },
};
