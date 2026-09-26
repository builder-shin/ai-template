import { spawn } from "node:child_process";

export interface Step {
  readonly name: string;
  readonly command: string;
  readonly cwd: string;
}

export interface StepResult {
  readonly name: string;
  readonly ok: boolean;
  readonly output: string;
  readonly durationMs: number;
}

/** 명령 하나를 쉘로 실행하고 출력을 모은다. 출력은 실패했을 때만 보여 준다. */
export function runStep(step: Step): Promise<StepResult> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const child = spawn(step.command, {
      cwd: step.cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    let output = "";
    const collect = (chunk: Buffer) => {
      output += chunk.toString("utf8");
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      const durationMs = performance.now() - startedAt;
      resolve({ name: step.name, ok: false, output: `${output}${error.message}\n`, durationMs });
    });
    child.on("close", (code) => {
      const durationMs = performance.now() - startedAt;
      resolve({ name: step.name, ok: code === 0, output, durationMs });
    });
  });
}

export async function runSteps(steps: readonly Step[]): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const step of steps) {
    results.push(await runStep(step));
  }
  return results;
}

/** 모두 통과하면 한 줄을, 실패하면 실패한 단계의 출력과 요약을 돌려준다. */
export function formatReport(results: readonly StepResult[]): string {
  const totalMs = results.reduce((sum, result) => sum + result.durationMs, 0);
  const total = String(results.length);
  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    return `check 통과: ${total}단계, ${(totalMs / 1000).toFixed(1)}s`;
  }
  const sections = failed.map((result) => `✗ ${result.name}\n${result.output.trimEnd()}`);
  const passed = String(results.length - failed.length);
  const names = failed.map((result) => result.name).join(", ");
  return [...sections, `check 실패: ${names} (통과 ${passed}/${total})`].join("\n\n");
}
