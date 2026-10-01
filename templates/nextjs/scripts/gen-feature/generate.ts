import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { format, resolveConfig } from "prettier";
import { GenerateError, namesFor, rename, type Names } from "./names";
import { directive, transform } from "./transform";

function files(root: string, directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new GenerateError(`${path}: 골든 기능에 링크를 두지 않는다.`);
    return entry.isDirectory() ? files(root, path) : [path];
  });
}
const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");
type Catalog = { [key: string]: string | Catalog };
function catalogCopy(catalog: Catalog, names: Names): Catalog {
  return Object.fromEntries(
    Object.entries(catalog).map(([key, value]) => [
      rename(key, names, "identifier"),
      typeof value === "string" ? rename(value, names) : catalogCopy(value, names),
    ]),
  );
}

export async function generateFeature(root: string, name: string, singular?: string) {
  const names = namesFor(name, singular);
  const copies = [
    ["src/features/posts", `src/features/${name}`],
    ["src/app/[locale]/posts", `src/app/[locale]/${name}`],
    ["src/app/[locale]/my-posts", `src/app/[locale]/my-${name}`],
  ] as const;
  const writes = new Map<string, string>();
  for (const [source, target] of copies) {
    if (existsSync(join(root, target)))
      throw new GenerateError(`${target}이 이미 있다. 다른 이름을 쓴다.`);
    for (const path of files(root, source)) {
      if (!/\.(tsx?|md)$/.test(path))
        throw new GenerateError(`${path}: 골든 기능은 TS·TSX·Markdown 텍스트만 둔다.`);
      const output = target + rename(path.slice(source.length), names);
      writes.set(output, transform(read(root, path), names, path));
    }
  }
  for (const prefix of ["", "my-"]) {
    const source = `scripts/http/${prefix}posts.integration.test.ts`;
    const output = `scripts/http/${prefix}${name}.integration.test.ts`;
    if (existsSync(join(root, output)))
      throw new GenerateError(`${output}이 이미 있다. 다른 이름을 쓴다.`);
    writes.set(output, transform(read(root, source), names, source));
  }
  for (const locale of ["ko", "en"]) {
    const path = `messages/${locale}.json`;
    const catalog = JSON.parse(read(root, path)) as Catalog;
    if (Object.hasOwn(catalog, names.camel))
      throw new GenerateError(`${path}: ${names.camel} 키가 이미 있다. 다른 이름을 쓴다.`);
    if (!catalog.posts || typeof catalog.posts === "string")
      throw new GenerateError(`${path}: posts 번역을 복원한다.`);
    catalog[names.camel] = catalogCopy(catalog.posts, names);
    writes.set(path, JSON.stringify(catalog, null, 2) + "\n");
  }
  const protectedFile = "src/lib/session/redirect.ts";
  const protectedSource = read(root, protectedFile);
  const protectedList = /(\[[^\]]*"\/my-posts"[^\]]*)(\]\.some)/;
  if (!protectedList.test(protectedSource))
    throw new GenerateError(`${protectedFile}: requiresLogin의 보호 경로 목록을 복원한다.`);
  writes.set(protectedFile, protectedSource.replace(protectedList, `$1, "/my-${name}"$2`));

  // 모든 충돌·입력을 확인하고 포맷한 뒤에만 쓴다. 거절할 때는 부분 생성하지 않는다.
  const formatted = new Map<string, string>();
  const config = await resolveConfig(join(root, "package.json"));
  for (const [path, content] of writes)
    formatted.set(path, await format(content, { ...config, filepath: path }));
  for (const [path, content] of formatted) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  const review: string[] = [];
  for (const [path, content] of formatted) {
    if (path.startsWith("messages/") || path === protectedFile) continue;
    content.split("\n").forEach((line, index) => {
      if (/^(고칠 곳|그대로)/.test(directive(line) ?? ""))
        review.push(`${path}:${index + 1} ${line.trim()}`);
    });
  }
  return { names, paths: [...formatted.keys()], review };
}
