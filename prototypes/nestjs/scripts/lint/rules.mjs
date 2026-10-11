import ts from "typescript";

/** web 하네스와 같은 TS 파서 기반의 실제 주석·같은 줄 사유 검사다. */
export function suppressionProblems(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const lines = source.split(/\r?\n/);
  const comments = new Map();
  function collect(node) {
    const children = node.getChildren(file);
    if (children.length) return children.forEach(collect);
    const start = node.getStart(file);
    const add = (pos, end) => {
      if (end <= start) comments.set(pos, { pos, end });
    };
    ts.forEachLeadingCommentRange(source, node.pos, add);
    ts.forEachTrailingCommentRange(source, node.pos, add);
  }
  collect(file);
  const problems = new Set();
  function check(position, ranges) {
    const line = file.getLineAndCharacterOfPosition(position).line;
    const start = file.getPositionOfLineAndCharacter(line, 0);
    const end = start + (lines[line]?.length ?? 0);
    if (
      !ranges.some((c) =>
        /(?:사유:|--|reason:)\s*\S.{3,}/.test(
          source.slice(Math.max(start, c.pos), Math.min(end, c.end)),
        ),
      )
    )
      problems.add(line + 1);
  }
  for (const comment of comments.values()) {
    for (const match of source
      .slice(comment.pos, comment.end)
      .matchAll(/eslint-disable\b|@ts-(?:expect-error|ignore|nocheck)\b/g)) {
      check(comment.pos + match.index, [comment]);
    }
  }
  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const pos = node.getStart(file);
      check(
        pos,
        [...comments.values()].filter((c) => c.pos > pos),
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return [...problems];
}

/** ESLint 억제가 사유 검사 자체를 끄지 못하도록 web처럼 별도 스캔 결과를 합친다. */
export function commentProcessor() {
  const sources = new Map();
  return {
    meta: { name: "prototype-comments", version: "1.0.0" },
    supportsAutofix: true,
    preprocess(source, filename) {
      sources.set(filename, source);
      return [source];
    },
    postprocess(messages, filename) {
      const source = sources.get(filename) ?? "";
      sources.delete(filename);
      return [
        ...messages.flat().filter((message) => message.ruleId !== "prototype/suppression-reason"),
        ...suppressionProblems(filename, source).map((line) => ({
          ruleId: "prototype/suppression-reason",
          severity: 2,
          line,
          column: 1,
          message: "억제에 사유가 없다. 대신 같은 줄의 실제 주석에 사유: 설명을 적어라.",
        })),
      ];
    },
  };
}

export default {
  rules: {
    "unsafe-sql": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          unsafe:
            "안전하지 않은 SQL 실행이다. 대신 매개변수를 바인딩하는 tagged $queryRaw/$executeRaw를 사용하라.",
        },
      },
      create(context) {
        return {
          MemberExpression(node) {
            const name = node.computed ? node.property.value : node.property.name;
            if (["$queryRawUnsafe", "$executeRawUnsafe"].includes(name))
              context.report({ node, messageId: "unsafe" });
          },
        };
      },
    },
    "suppression-reason": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          reason: "억제에 사유가 없다. 대신 같은 줄의 실제 주석에 사유: 설명을 적어라.",
        },
      },
      create(context) {
        return {
          Program() {
            for (const line of suppressionProblems(context.filename, context.sourceCode.text))
              context.report({ loc: { line, column: 0 }, messageId: "reason" });
          },
        };
      },
    },
  },
};
