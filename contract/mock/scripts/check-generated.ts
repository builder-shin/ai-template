import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** 계약에서 타입을 임시 파일로 다시 생성해 커밋된 src/generated/api.ts와 비교한다. */
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "mock-"));
const fresh = join(dir, "api.ts");

try {
  const generate = spawnSync(`openapi-typescript ../openapi.yaml -o "${fresh}"`, {
    cwd: packageDir,
    shell: true,
    encoding: "utf8",
  });
  if (generate.status !== 0) {
    console.error(generate.stdout, generate.stderr);
    process.exitCode = 1;
  } else {
    const committed = readFileSync(join(packageDir, "src", "generated", "api.ts"), "utf8");
    if (readFileSync(fresh, "utf8") !== committed) {
      console.error(
        "src/generated/api.ts가 contract/openapi.yaml과 다르다. 직접 고치지 말고 `pnpm gen`으로 다시 생성한다.",
      );
      process.exitCode = 1;
    }
  }
} finally {
  // 비교가 끝나면 임시 폴더를 남기지 않는다.
  rmSync(dir, { recursive: true, force: true });
}
