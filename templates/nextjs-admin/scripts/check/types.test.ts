import { expect, it } from "vitest";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { binary } from "../process.mjs";
import { assembleSteps } from "./steps";
import { linkDependencies } from "../test/dependency-links";

it("이전 타입 생성 뒤 route를 옮겨도 현재 route를 검증하며 dev 산출물을 보존한다", () => {
  const root = mkdtempSync(join(tmpdir(), "nextjs-route-types-"));
  try {
    linkDependencies(resolve("."), root);
    mkdirSync(join(root, "src/app/old"), { recursive: true });
    writeFileSync(
      join(root, "src/app/old/page.tsx"),
      "export default function Page() { return null; }",
    );
    writeFileSync(join(root, "package.json"), '{"private":true,"type":"module"}');
    writeFileSync(join(root, "next.config.mjs"), "export default { agentRules: false };");
    cpSync("tsconfig.json", join(root, "tsconfig.json"));
    mkdirSync(join(root, "scripts/check"), { recursive: true });
    cpSync("scripts/check/types.ts", join(root, "scripts/check/types.ts"));
    cpSync("scripts/process.mjs", join(root, "scripts/process.mjs"));
    cpSync("tsconfig.check.json", join(root, "tsconfig.check.json"));
    const generated = binary("next", ["typegen"], { cwd: root });
    expect(generated.status, `${generated.stdout}${generated.stderr}`).toBe(0);
    const oldValidator = readFileSync(join(root, ".next/types/validator.ts"), "utf8");
    mkdirSync(join(root, ".next/dev/types"), { recursive: true });
    writeFileSync(join(root, ".next/dev/types/validator.ts"), oldValidator);
    mkdirSync(join(root, ".next/types/app/old"), { recursive: true });
    writeFileSync(
      join(root, ".next/types/app/old/page.ts"),
      'import "../../../../../src/app/old/page.js";',
    );
    renameSync(join(root, "src/app/old"), join(root, "src/app/new"));
    const step = assembleSteps({}, false, []).find((step) => step.name === "types")!;
    const run = () => binary(step.args[0]!, step.args.slice(1), { cwd: root });
    const moved = run();
    expect(moved.status, `${moved.stdout}${moved.stderr}`).toBe(0);
    expect(readFileSync(join(root, ".next/types/validator.ts"), "utf8")).toContain("/new/page.js");
    expect(readFileSync(join(root, ".next/dev/types/validator.ts"), "utf8")).toBe(oldValidator);
    writeFileSync(join(root, "src/app/new/page.tsx"), "export default 42;");
    expect(run().status).not.toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);
