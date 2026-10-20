import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it, onTestFinished } from "vitest";
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
  const closed = once(child, "close");
  onTestFinished(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await closed;
  });
  captureBuildOutput(child, (text) => output.push(text));
  await closed;
  if (code === 0) expect(output).toEqual([]);
  else {
    expect(output).toHaveLength(1);
    expect(output[0]).toContain("Type error: broken.ts:12");
    expect(output[0]).toContain("Failed to type check.");
  }
});

it("빌드가 신호로 종료되면 두 스트림의 진단을 정확히 한 번 전달한다", async () => {
  const child = spawn(
    process.execPath,
    [
      "-e",
      `
    process.stdout.write('build stdout\\n', () => {
      process.stderr.write('build stderr\\n', () => process.send('ready'));
    });
    setInterval(() => {}, 1000);
  `,
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  const closed = once(child, "close");
  onTestFinished(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await closed;
  });
  const output: string[] = [];
  captureBuildOutput(child, (text) => output.push(text));
  await once(child, "message");
  child.kill("SIGTERM");
  expect(await closed).toEqual([null, "SIGTERM"]);
  expect(output).toHaveLength(1);
  expect(output[0]).toContain("build stdout");
  expect(output[0]).toContain("build stderr");
});
