import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { binary } from "../process.mjs";

// build/typegen의 산출물만 비운다. 실행 중인 dev의 타입은 건드리지 않는다.
rmSync(resolve(".next/types"), { recursive: true, force: true });
for (const [command, args] of [
  ["next", ["typegen"]],
  ["tsc", ["--noEmit", "--project", "tsconfig.check.json"]],
] as const) {
  const result = binary(command, [...args], { cwd: process.cwd() });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0) {
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    process.exit(result.status ?? 1);
  }
}
