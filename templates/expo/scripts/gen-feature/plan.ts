import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { featureNames, format, transform } from "./transform.ts";
import { registerPlan, noLinks, type FileEdit } from "./edits.ts";
export type { FileEdit } from "./edits.ts";
const reserved = new Set([
  "posts",
  "account",
  "auth",
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "verify-email",
  "me",
  "oauth",
  "api",
  "admin",
  "web",
  "mobile",
  "new",
  "edit",
  "index",
  "default",
  "class",
  "constructor",
  "prototype",
  "await",
  "arguments",
  "eval",
  "true",
  "false",
  "null",
  "undefined",
]);
const goldenFiles = [
  "api.ts",
  "queries.ts",
  "schemas.ts",
  "list-screen.tsx",
  "detail-screen.tsx",
  "editor-screen.tsx",
  "cover-field.tsx",
  "index.ts",
  "schemas.test.ts",
  "editor-screen.test.tsx",
];
function read(root: string, path: string) {
  const file = join(root, path);
  noLinks(root, file);
  if (!existsSync(file) || !lstatSync(file).isFile())
    throw new Error(`Missing golden input: ${path}`);
  return readFileSync(file, "utf8");
}
export function planFeature(input: string, name: string): FileEdit[] {
  if (
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) ||
    name.length > 50 ||
    reserved.has(name) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(name)
  )
    throw new Error("Invalid or reserved feature name.");
  const root = realpathSync(resolve(input)),
    names = featureNames(name);
  const manifest = JSON.parse(read(root, "package.json")) as {
    dependencies?: Record<string, string>;
  };
  if (!manifest.dependencies?.["expo-router"]) throw new Error("Use an Expo project root.");
  const registry = JSON.parse(read(root, "src/lib/navigation/features.json")) as {
    features: { name: string; path: string; routePrefix: string; titleKey: string }[];
    protectedScreens: { name: string; titleKey: string }[];
  };
  if (registry.features.some((item) => item.name.toLowerCase() === name))
    throw new Error("Duplicate feature registration.");
  const ko: Record<string, string> = JSON.parse(read(root, "src/lib/i18n/messages/ko.json"));
  const en: Record<string, string> = JSON.parse(read(root, "src/lib/i18n/messages/en.json"));
  if (Object.keys(ko).sort().join("\n") !== Object.keys(en).sort().join("\n"))
    throw new Error("Catalog input keys differ.");
  const messages = Object.fromEntries(
    Object.keys(ko)
      .filter((key) => key === "posts" || /^post[A-Z]/.test(key))
      .map((key) => [key, key === "posts" ? names.camel : `${names.camel}${key.slice(4)}`]),
  );
  for (const key of Object.values(messages))
    if (Object.hasOwn(ko, key)) throw new Error("Message key collision.");
  const expected = new Set(Object.values(names.identifiers));
  for (const path of readdirSync(join(root, "src/features"), {
    recursive: true,
    encoding: "utf8",
  })) {
    if (path.split(/[\\/]/)[0] === "posts" || !/\.tsx?$/.test(path)) continue;
    const content = read(root, `src/features/${path}`),
      source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isIdentifier(node) && expected.has(node.text))
        throw new Error("Feature import/identifier collision.");
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const edits: FileEdit[] = [];
  const add = (path: string, content: string, replace = false) => {
    const target = join(root, path);
    noLinks(root, target);
    if (!replace && existsSync(target)) throw new Error(`Output exists: ${path}`);
    edits.push({ path: target, content });
  };
  // HTTP integration tests remain tied to the reviewed posts backend; copy schema/form tests.
  for (const file of goldenFiles)
    add(
      `src/features/${name}/${file}`,
      transform(read(root, `src/features/posts/${file}`), file, name, messages),
    );
  const routes = [
    [`src/app/${name}/index.tsx`, `../../features/${name}`, `${names.pascal}ListScreen`],
    [`src/app/${name}/[id].tsx`, `../../features/${name}`, `${names.pascal}DetailScreen`],
    [`src/app/(app)/${name}/new.tsx`, `../../../features/${name}`, `${names.pascal}EditorScreen`],
    [
      `src/app/(app)/${name}/[id]/edit.tsx`,
      `../../../../features/${name}`,
      `${names.pascal}EditorScreen`,
    ],
  ];
  for (const [path, from, screen] of routes)
    add(path!, format(`export { ${screen} as default } from ${JSON.stringify(from)};\n`, path!));
  for (const [language, catalog] of [
    ["ko", ko],
    ["en", en],
  ] as const) {
    for (const [oldKey, newKey] of Object.entries(messages))
      catalog[newKey] = oldKey === "posts" ? name : catalog[oldKey]!;
    add(
      `src/lib/i18n/messages/${language}.json`,
      format(JSON.stringify(catalog), "messages.json"),
      true,
    );
  }
  registry.features.push({
    name,
    path: `/${name}`,
    routePrefix: `/${name}`,
    titleKey: names.camel,
  });
  registry.protectedScreens.push(
    { name: `${name}/new`, titleKey: messages.postNew! },
    { name: `${name}/[id]/edit`, titleKey: messages.postEdit! },
  );
  add("src/lib/navigation/features.json", format(JSON.stringify(registry), "features.json"), true);
  add(
    `src/features/${name}/README.md`,
    format(
      `# ${name}\n\nThis is a copy of the posts golden. Its API still uses /posts and the Post* generated contract types. Before product use, review the API resource and regenerate types, then permissions, relationships, fields, ko/en text, query invalidation and real backend/native E2E tests. Schema and native form tests were copied; posts-specific HTTP tests were deliberately not copied.\n\nRoutes and protected screens are registered in src/lib/navigation/features.json. Do not remove session-generation checks or cache boundaries.\n`,
      "README.md",
    ),
  );
  return registerPlan(root, edits);
}
