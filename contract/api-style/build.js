// @ts-check
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { parse } from "yaml";

/** 이 패키지 폴더. 번들 안의 경로 주석이 이 폴더 기준이어야 어디서 빌드하든 결과가 같다. */
const root = dirname(fileURLToPath(import.meta.url));
const outfile = join(root, "dist", "lint.mjs");

/** 번들 안의 CommonJS 의존성이 require로 Node 내장 모듈을 부른다. ESM에는 require가 없어 만들어 둔다. */
const REQUIRE_BANNER =
  "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);";

/** redocly.yaml의 rules를 넣어 번들을 만들고, 파일에 쓰지 않은 채 내용을 돌려준다. */
async function bundle() {
  const config = /** @type {{ rules?: unknown }} */ (
    parse(readFileSync(join(root, "redocly.yaml"), "utf8"))
  );
  const result = await build({
    entryPoints: ["bundle.js"],
    absWorkingDir: root,
    outfile,
    write: false,
    bundle: true,
    platform: "node",
    format: "esm",
    target: ["node24"],
    minify: true,
    legalComments: "none",
    define: { API_STYLE_RULES: JSON.stringify(config.rules ?? {}) },
    banner: { js: REQUIRE_BANNER },
  });
  const [output] = result.outputFiles;
  if (output === undefined) throw new Error("esbuild가 번들을 만들지 않았다.");
  return Buffer.from(output.contents);
}

/** 사용법: node build.js [--check]. --check면 dist/lint.mjs가 소스로 다시 만든 것과 같은지만 본다. */
const contents = await bundle();
if (process.argv.includes("--check")) {
  let current;
  try {
    current = readFileSync(outfile);
  } catch {
    current = undefined;
  }
  if (current === undefined || !contents.equals(current)) {
    console.error(
      "dist/lint.mjs가 소스와 다르다. pnpm --filter @ai-template/api-style run build를 돌린다.",
    );
    process.exitCode = 1;
  }
} else {
  mkdirSync(dirname(outfile), { recursive: true });
  writeFileSync(outfile, contents);
}
