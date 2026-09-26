import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readSharedAssets } from "./manifest.ts";
import { verifyTemplate } from "./verify.ts";

/** templates/ 아래 템플릿마다 하네스 표준을 검사한다. 템플릿이 없으면 통과한다. */
const repoRoot = process.cwd();
const templatesDir = join(repoRoot, "templates");
const names = existsSync(templatesDir)
  ? readdirSync(templatesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

const shared = readSharedAssets(repoRoot);
let failed = 0;
for (const name of names) {
  const problems = verifyTemplate(repoRoot, name, shared);
  for (const problem of problems) console.error(`templates/${name}: ${problem}`);
  if (problems.length > 0) failed += 1;
}
if (names.length === 0) console.log("검사할 템플릿이 없다.");
process.exitCode = failed > 0 ? 1 : 0;
