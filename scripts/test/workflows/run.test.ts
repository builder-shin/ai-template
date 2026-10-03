import { join } from "node:path";
import { expect, it } from "vitest";
import { checkWorkflows } from "../../src/workflows/check.ts";

const root = process.cwd();
const binary = join(root, "cache", "actionlint", "actionlint.exe");
const files = [".github/workflows/broken.yaml"];

it("actionlint 진단만 출력하고 실패 코드와 비활성 도구 인자를 보존한다", () => {
  const result = checkWorkflows(root, binary, files, (command, args, options) => {
    expect(command).toBe(binary);
    expect(args).toEqual(["-shellcheck=", "-pyflakes=", ".github/workflows/broken.yaml"]);
    expect(options).toEqual({ cwd: root, encoding: "utf8" });
    return { status: 1, stdout: "", stderr: "broken.yaml:1: unknown key\n" };
  });
  expect(result).toEqual({ code: 1, output: "broken.yaml:1: unknown key" });
});

it("깨진 바이너리의 실행 오류는 지울 캐시 폴더를 안내한다", () => {
  const result = checkWorkflows(root, binary, files, () => ({
    status: null,
    stdout: "",
    stderr: "",
    error: new Error("ENOEXEC"),
  }));
  expect(result.code).toBe(1);
  expect(result.output).toContain("ENOEXEC");
  expect(result.output).toContain(join(root, "cache", "actionlint"));
  expect(result.output).toMatch(/—.*지우고.*다시/);
});

it("성공하면 파일 수 한 줄만 출력한다", () => {
  expect(
    checkWorkflows(root, binary, files, () => ({ status: 0, stdout: "", stderr: "" })),
  ).toEqual({ code: 0, output: "워크플로 검사 통과: 1개" });
});
