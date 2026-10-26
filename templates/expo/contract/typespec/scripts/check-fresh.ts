import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** TypeSpec 원본을 임시 폴더로 컴파일해 커밋된 contract/openapi.yaml과 비교한다. */
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const committedPath = join(packageDir, "..", "openapi.yaml");
const outDir = mkdtempSync(join(tmpdir(), "contract-"));

const compile = spawnSync(
  `tsp compile src/main.tsp --option "@typespec/openapi3.emitter-output-dir=${outDir}"`,
  { cwd: packageDir, shell: true, encoding: "utf8" },
);
if (compile.status !== 0) {
  console.error(compile.stdout, compile.stderr);
  process.exit(1);
}

const fresh = readFileSync(join(outDir, "openapi.yaml"), "utf8");
const committed = readFileSync(committedPath, "utf8");
if (fresh !== committed) {
  console.error(
    "contract/openapi.yaml이 TypeSpec 원본과 다르다. 직접 고치지 말고 `pnpm gen`으로 다시 생성해 커밋한다.",
  );
  process.exit(1);
}
