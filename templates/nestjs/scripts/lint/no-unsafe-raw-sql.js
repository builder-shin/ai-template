export default {
  meta: {
    type: "problem",
    schema: [],
    messages: { unsafe: "안전하지 않은 SQL 호출 대신 $queryRaw·$executeRaw의 태그 템플릿을 쓴다" },
  },
  create(context) {
    const unsafe = (name) => name === "$queryRawUnsafe" || name === "$executeRawUnsafe";
    return {
      Property(node) {
        if (node.parent.type === "ObjectPattern" && unsafe(node.key.name ?? node.key.value))
          context.report({ node, messageId: "unsafe" });
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === "Identifier" && unsafe(callee.name))
          context.report({ node, messageId: "unsafe" });
        if (callee.type !== "MemberExpression") return;
        const name =
          callee.computed && callee.property.type === "Literal"
            ? callee.property.value
            : !callee.computed && callee.property.type === "Identifier"
              ? callee.property.name
              : null;
        if (unsafe(name)) context.report({ node, messageId: "unsafe" });
      },
    };
  },
};
