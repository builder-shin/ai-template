import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { temporaryFolder, write } from "./helpers.ts";

interface Result {
  status: number | null;
  signal?: string;
  error?: Error;
}
interface ProxyModule {
  apiCommand: (
    root: string,
    script: string,
    args: string[],
    execute: (command: string, args: string[], options: { cwd: string; stdio: string }) => Result,
  ) => number;
}
async function proxy() {
  const root = temporaryFolder();
  for (const [source, target] of [
    ["nestjs-only/scripts/api-command.mjs", "scripts/api-command.mjs"],
    ["scripts/process.mjs", "scripts/process.mjs"],
  ]) {
    if (!source || !target) throw new Error("시험 원본 경로가 없다");
    write(
      root,
      target,
      readFileSync(resolve(import.meta.dirname, "../assets/combo", source), "utf8"),
    );
  }
  return {
    root,
    module: (await import(
      pathToFileURL(join(root, "scripts/api-command.mjs")).href
    )) as ProxyModule,
  };
}
it("API proxy는 현재 작업 자산의 스크립트·공백 인자·e2e 서버 인자를 실제 API cwd에 전달한다", async () => {
  const { root, module } = await proxy();
  const calls: unknown[] = [];
  const args = [
    "--web-url",
    "http://localhost:3100",
    "--",
    "node",
    "경로에 공백.mjs",
    "literal;$()",
  ];
  expect(
    module.apiCommand(root, "e2e:serve", args, (command, argv, options) => {
      calls.push({ command, argv, options });
      return { status: 7 };
    }),
  ).toBe(7);
  expect(calls).toEqual([
    {
      command: "pnpm",
      argv: ["--dir", join(root, "apps/api"), "run", "e2e:serve", ...args],
      options: { cwd: root, stdio: "inherit" },
    },
  ]);
});
it.each([
  ["SIGINT", 130],
  ["SIGTERM", 143],
  ["SIGKILL", 137],
] as const)("API proxy는 하위 %s 종료를 %s로 전달한다", async (signal, code) => {
  const { root, module } = await proxy();
  expect(module.apiCommand(root, "dev", [], () => ({ status: null, signal }))).toBe(code);
});
it("API proxy는 실행 오류·불명 종료·금지한 의존성 변경 명령을 숨기지 않는다", async () => {
  const { root, module } = await proxy();
  const error = new Error("실행 파일이 없다");
  expect(() => module.apiCommand(root, "build", [], () => ({ status: null, error }))).toThrow(
    error,
  );
  expect(module.apiCommand(root, "build", [], () => ({ status: null }))).toBe(1);
  expect(module.apiCommand(root, "build", [], () => ({ status: null, signal: "UNKNOWN" }))).toBe(1);
  for (const script of ["add", "remove", "exec", "unknown"])
    expect(() =>
      module.apiCommand(root, script, [], () => {
        throw new Error("호출하면 안 된다");
      }),
    ).toThrow("API 스크립트가 올바르지 않다");
});
