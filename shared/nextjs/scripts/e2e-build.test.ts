import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it } from "vitest";
import { captureBuildOutput } from "./e2e-runtime";

it.each([0, 7])("빌드 출력은 실패 때만 전달한다 (종료 코드 %s)", async (code) => {
  const child = spawn(
    process.execPath,
    [
      "-e",
      `
    console.log('Type error: broken.ts:12');
    console.error('Failed to type check.');
    process.exitCode = ${code};
  `,
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const output: string[] = [];
  captureBuildOutput(child, (text) => output.push(text));
  await once(child, "close");
  if (code === 0) expect(output).toEqual([]);
  else {
    expect(output.join("")).toContain("Type error: broken.ts:12");
    expect(output.join("")).toContain("Failed to type check.");
  }
});
