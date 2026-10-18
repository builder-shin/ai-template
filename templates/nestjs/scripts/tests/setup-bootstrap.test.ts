import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { environment } from "../child-environment.mjs";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
    expect(existsSync(root)).toBe(false);
  }
  roots.length = 0;
});
function fixture(fail: boolean) {
  const root = mkdtempSync(join(tmpdir(), "aitpl-setup-bootstrap-"));
  roots.push(root);
  const cli = join(root, "pnpm-fixture.cjs");
  writeFileSync(
    cli,
    `require('node:fs').writeFileSync('install.json',JSON.stringify(process.argv.slice(2)));
    if(${String(fail)})process.exit(23);`,
  );
  mkdirSync(join(root, "node_modules/tsx"), { recursive: true });
  writeFileSync(
    join(root, "node_modules/tsx/package.json"),
    '{"type":"module","exports":"./index.mjs"}',
  );
  writeFileSync(join(root, "node_modules/tsx/index.mjs"), "export {};");
  mkdirSync(join(root, "scripts"));
  writeFileSync(
    join(root, "scripts/setup.ts"),
    "process.getBuiltinModule('node:fs').writeFileSync('setup-effect','준비');",
  );
  return { root, cli };
}
it("bootstrap은 frozen 설치 뒤에만 준비 스크립트를 실행한다", () => {
  const { root, cli } = fixture(false);
  const result = spawnSync(process.execPath, [join(process.cwd(), "scripts/setup.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: { ...environment(), npm_execpath: cli },
  });
  expect(result.status).toBe(0);
  expect(JSON.parse(readFileSync(join(root, "install.json"), "utf8"))).toEqual([
    "install",
    "--frozen-lockfile",
  ]);
  expect(readFileSync(join(root, "setup-effect"), "utf8")).toBe("준비");
});
it("bootstrap은 설치 실패 종료를 보존하고 준비를 실행하지 않는다", () => {
  const { root, cli } = fixture(true);
  const result = spawnSync(process.execPath, [join(process.cwd(), "scripts/setup.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: { ...environment(), npm_execpath: cli },
  });
  expect(result.status).toBe(23);
  expect(existsSync(join(root, "setup-effect"))).toBe(false);
});

it.each([false, true])("bootstrap은 native pnpm의 설치와 종료를 보존한다: %s", (fail) => {
  const { root } = fixture(fail);
  const cli = join(root, process.platform === "win32" ? "pnpm.exe" : "pnpm");
  copyFileSync(process.execPath, cli);
  const preload = join(root, "native-fixture.cjs");
  writeFileSync(
    preload,
    `if(process.execPath===${JSON.stringify(cli)}) {
      require('node:fs').writeFileSync('install.json', JSON.stringify(process.argv.slice(1)));
      process.exit(${fail ? "23" : "0"});
    }`,
  );
  const result = spawnSync(process.execPath, [join(process.cwd(), "scripts/setup.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...environment(),
      npm_execpath: cli,
      NODE_OPTIONS: `--require=${JSON.stringify(preload)}`,
    },
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(fail ? 23 : 0);
  expect(JSON.parse(readFileSync(join(root, "install.json"), "utf8"))).toEqual([
    join(root, "install"),
    "--frozen-lockfile",
  ]);
  expect(existsSync(join(root, "setup-effect"))).toBe(!fail);
});
