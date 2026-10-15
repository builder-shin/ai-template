import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { format, resolveConfig } from "prettier";
import { isMain, main } from "./runtime.js";
import { moduleNames, renameGolden } from "./gen-module-transform.js";
import { registerModule } from "./gen-module-registration.js";

export async function genModule(root: string, name: string): Promise<readonly string[]> {
  const names = moduleNames(name);
  const directory = `src/modules/${name}`;
  if (existsSync(join(root, directory))) throw new Error(`${directory}: 모듈이 이미 있다`);
  const read = (path: string) => readFileSync(join(root, path), "utf8");
  const output = registerModule(read, names);
  // 외부 모듈의 영속성 fixture에 기대지 않는 골든 단위 시험을 함께 복사한다.
  const tests = new Set([
    "policies.test.ts",
    "transitions.test.ts",
    "events.test.ts",
    "cache.test.ts",
    "schemas.test.ts",
  ]);
  for (const entry of readdirSync(join(root, "src/modules/posts"), {
    recursive: true,
    encoding: "utf8",
  })) {
    const file = entry.replaceAll("\\", "/");
    if (!file.endsWith(".ts") || (file.startsWith("tests/") && !tests.has(file.slice(6)))) continue;
    const target = `${directory}/${file.replace("posts.module.ts", `${name}.module.ts`)}`;
    output.set(target, renameGolden(read(`src/modules/posts/${file}`), names));
  }
  const config = await resolveConfig(join(root, "package.json"));
  for (const [path, text] of output)
    if (path.endsWith(".ts"))
      output.set(path, await format(text, { ...config, parser: "typescript" }));
  for (const [path, text] of output) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return [...output.keys()].sort();
}
if (isMain(import.meta.url))
  await main(async () => {
    const name = process.argv[2] ?? "";
    if (process.argv.length !== 3) throw new Error("사용법: pnpm gen:module <소문자-kebab-복수형>");
    const files = await genModule(process.cwd(), name);
    process.stdout.write(
      `${files.join("\n")}\n모듈의 필드·권한·문구를 검토하고 pnpm db:revision create_${name}을 실행한다.\n새 리소스를 계약에 먼저 등록하고 pnpm gen과 pnpm check --fast를 실행한다.\n`,
    );
  });
