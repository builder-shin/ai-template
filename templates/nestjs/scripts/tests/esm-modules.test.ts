import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { transformSync, type Options } from "@swc/core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { environment } from "../child-environment.mjs";

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-esm-modules-"));
  writeFileSync(join(root, "package.json"), '{"type":"module"}');
  symlinkSync(resolve("node_modules"), join(root, "node_modules"), "junction");
  const config = JSON.parse(readFileSync(".swcrc", "utf8")) as Options;
  for (const name of readdirSync("src", { recursive: true, encoding: "utf8" })) {
    if (!name.endsWith(".ts") || name.endsWith(".d.ts") || name.split(/[\\/]/).includes("tests"))
      continue;
    const target = join(root, name.replace(/\.ts$/, ".js"));
    mkdirSync(dirname(target), { recursive: true });
    const { code } = transformSync(readFileSync(join("src", name), "utf8"), {
      ...config,
      filename: name,
      sourceMaps: false,
    });
    writeFileSync(target, code);
  }
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

it.each([
  ["modules/roles/index.js", "RolesRepository"],
  ["modules/users/index.js", "UsersAdminService"],
  ["modules/auth/index.js", "RegistrationService"],
  ["app.module.js", "AppModule"],
  ["seed.js", "seed"],
])("운영 ESM은 인프라와 환경 파일 없이 공개 모듈을 import한다: %s", (entry, exported) => {
  const url = pathToFileURL(join(root, entry)).href;
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import 'reflect-metadata'; const module = await import(${JSON.stringify(url)}); if(typeof module[${JSON.stringify(exported)}] !== 'function') throw new Error('공개 export가 없다'); process.stdout.write('import 통과');`,
    ],
    { cwd: root, encoding: "utf8", env: environment(), timeout: 15000 },
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("import 통과");
});
