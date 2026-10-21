import ts from "typescript";
import { spawnSync } from "node:child_process";
import { command } from "../process.mjs";
export function featureNames(name: string) {
  const pascal = name
    .split("-")
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
  const camel = pascal[0]!.toLowerCase() + pascal.slice(1);
  return {
    pascal,
    camel,
    identifiers: {
      PostsApi: `${pascal}Api`,
      PostDocument: `${pascal}Document`,
      PostCollection: `${pascal}Collection`,
      PostResource: `${pascal}Resource`,
      PostCreateInput: `${pascal}CreateInput`,
      PostUpdateInput: `${pascal}UpdateInput`,
      PostListInput: `${pascal}ListInput`,
      PostScope: `${pascal}Scope`,
      PostsListScreen: `${pascal}ListScreen`,
      PostDetailScreen: `${pascal}DetailScreen`,
      PostEditorScreen: `${pascal}EditorScreen`,
      PostForm: `${pascal}Form`,
      PostListItem: `${pascal}ListItem`,
      usePosts: `use${pascal}List`,
      usePost: `use${pascal}`,
      usePostScope: `use${pascal}Scope`,
      useInvalidatePosts: `useInvalidate${pascal}`,
      postKeys: `${camel}Keys`,
      postSchema: `${camel}Schema`,
      postId: `${camel}Id`,
    } as Record<string, string>,
  };
}
export function format(content: string, path: string): string {
  const [executable, ...args] = command("prettier", ["--stdin-filepath", path]);
  const result = spawnSync(executable, args, {
    input: content,
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error("Cannot format generation input.");
  return result.stdout;
}
export function transform(
  content: string,
  file: string,
  name: string,
  messages: Record<string, string>,
): string {
  const names = featureNames(name).identifiers;
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const result = ts.transform(source, [
    (context) => {
      const visitor: ts.Visitor = (node) => {
        if (ts.isIdentifier(node) && Object.hasOwn(names, node.text))
          return ts.factory.createIdentifier(names[node.text]!);
        if (file !== "api.ts" && ts.isTemplateHead(node) && node.text.startsWith("/posts/"))
          return ts.factory.createTemplateHead(`/${name}/${node.text.slice(7)}`);
        if (ts.isStringLiteral(node) && file !== "api.ts") {
          let value = Object.hasOwn(messages, node.text) ? messages[node.text]! : node.text;
          if (value === "/") value = `/${name}`;
          else if (value.startsWith("/posts/")) value = `/${name}/${value.slice(7)}`;
          if (value !== node.text) return ts.factory.createStringLiteral(value);
        }
        return ts.visitEachChild(node, visitor, context);
      };
      return (root) => ts.visitNode(root, visitor) as ts.SourceFile;
    },
  ]);
  try {
    return format(ts.createPrinter().printFile(result.transformed[0]!), file);
  } finally {
    result.dispose();
  }
}
