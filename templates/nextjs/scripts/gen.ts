import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateFiles, staleFiles } from "./generate";
import { pnpm } from "./process.mjs";
import { resolveContractPaths } from "./gen-config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.includes("--check");
const temporary = mkdtempSync(join(tmpdir(), "aitpl-nextjs-gen-"));

function run(args: string[], cwd: string) {
  const result = pnpm(args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0)
    throw new Error(`${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`);
}

try {
  const contract = resolveContractPaths(root);
  // 임시 산출물로 비교하므로 검사 실패가 작업 파일을 바꾸지 않는다.
  run(
    [
      "exec",
      "tsp",
      "compile",
      "src/main.tsp",
      "--option",
      `@typespec/openapi3.emitter-output-dir=${temporary}`,
    ],
    contract.typespec,
  );
  const openapi = readFileSync(join(temporary, "openapi.yaml"), "utf8");
  const mockPath = join(temporary, "mock.ts");
  run(["exec", "openapi-typescript", join(temporary, "openapi.yaml"), "-o", mockPath], root);
  const expected = await generateFiles(root, openapi, readFileSync(mockPath, "utf8"));
  if (check) {
    const actual = Object.fromEntries(
      Object.keys(expected).map((path) => [
        path,
        existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : "",
      ]),
    );
    const stale = staleFiles(expected, actual);
    if (stale.length)
      throw new Error(
        stale.map((path) => `${path}:1 생성물 — pnpm gen으로 다시 생성한다.`).join("\n"),
      );
  } else {
    for (const [path, content] of Object.entries(expected)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
  }
  console.log(check ? "생성물 최신 여부 통과" : "계약·web·목 타입 생성 완료");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
