import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runStages } from "../runner.js";
import { STAGES, type Stage } from "../stages.js";

let root: string;
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
const command = [
  process.execPath,
  "-e",
  "require('node:fs').appendFileSync('effects',JSON.stringify(process.argv.slice(1))+'\\n')",
];
const stage: Stage = {
  name: "test",
  inputs: ["src", "scripts"],
  command,
  fastCommand: command,
  selectChangedModules: true,
};
const run = () => runStages([stage], { fast: true, root, cacheDir: join(root, ".cache/check") });
const effects = (): string[][] =>
  readFileSync(join(root, "effects"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as string[]);
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-fast-selection-"));
  for (const name of ["posts", "users"]) {
    write(`src/modules/${name}/service.ts`, "처음");
    write(`src/modules/${name}/tests/service.test.ts`, "시험");
  }
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
it("기준선이 없으면 모든 단위 시험을 실행한다", async () => {
  expect((await run()).ok).toBe(true);
  expect(effects()).toEqual([[]]);
});
it("바뀐 모듈의 실제 시험 파일만 명령에 넘긴다", async () => {
  await run();
  write("src/modules/posts/service.ts", "수정");
  expect((await run()).ok).toBe(true);
  expect(effects()).toEqual([[], ["src/modules/posts/tests/service.test.ts"]]);
  await run();
  expect(effects()).toHaveLength(2);
});
it("여러 모듈을 고치면 두 모듈의 시험을 모두 실행한다", async () => {
  await run();
  write("src/modules/posts/service.ts", "수정");
  write("src/modules/users/service.ts", "수정");
  await run();
  expect(effects()[1]).toEqual([
    "src/modules/posts/tests/service.test.ts",
    "src/modules/users/tests/service.test.ts",
  ]);
});
it.each(["src/core/cache.ts", "scripts/task.ts", "src/app.module.ts"])(
  "공통 입력 %s가 바뀌면 전체 단위를 실행한다",
  async (path) => {
    await run();
    write(path, "새 입력");
    await run();
    expect(effects()).toEqual([[], []]);
  },
);
it("새 시험도 선택하고 삭제된 모듈에 시험이 없으면 전체로 되돌린다", async () => {
  await run();
  write("src/modules/posts/tests/new.test.ts", "새 시험");
  await run();
  expect(effects()[1]).toEqual([
    "src/modules/posts/tests/new.test.ts",
    "src/modules/posts/tests/service.test.ts",
  ]);
  rmSync(join(root, "src/modules/posts"), { recursive: true });
  await run();
  expect(effects()[2]).toEqual([]);
});
it("시험 없는 모듈 변경도 0개 선택으로 성공시키지 않는다", async () => {
  await run();
  write("src/modules/widgets/service.ts", "새 모듈");
  await run();
  expect(effects()).toEqual([[], []]);
});
it.each(["test", "typecheck"] as const)(
  "실제 %s 단계는 hook 입력 변경으로 성공 캐시를 무효화한다",
  async (name) => {
    const actual = STAGES.find((value) => value.name === name);
    if (!actual) throw new Error("실제 검사 단계가 없다");
    const item = { ...actual, command, fastCommand: command };
    const options = { fast: true, root, cacheDir: join(root, ".cache/check") };
    const file =
      name === "test" ? ".claude/hooks/pre-tool-use.mjs" : ".claude/hooks/pre-tool-use.d.mts";
    write(file, "처음");
    expect((await runStages([item], options)).ok).toBe(true);
    write(file, "바뀐 hook");
    expect((await runStages([item], options)).ok).toBe(true);
    expect(effects()).toHaveLength(2);
  },
);
