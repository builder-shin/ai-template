import { describe, expect, it } from "vitest";
import { formatReport, runStep, type StepResult } from "../../src/check/run-steps.ts";

const cwd = process.cwd();

describe("runStep", () => {
  it("성공한 명령의 출력을 모은다", async () => {
    const result = await runStep({ name: "ok", command: `node -e "console.log('hello')"`, cwd });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("hello");
  });

  it("0이 아닌 종료 코드를 실패로 기록한다", async () => {
    const command = `node -e "console.error('boom'); process.exit(3)"`;
    const result = await runStep({ name: "fail", command, cwd });
    expect(result.ok).toBe(false);
    expect(result.output).toContain("boom");
  });
});

describe("formatReport", () => {
  const passed: StepResult = { name: "lint", ok: true, output: "noise", durationMs: 1000 };
  const failed: StepResult = { name: "test", ok: false, output: "1 failed\n", durationMs: 500 };

  it("모두 통과하면 한 줄만 낸다", () => {
    expect(formatReport([passed, passed])).toBe("check 통과: 2단계, 2.0s");
  });

  it("실패하면 실패한 단계의 출력과 요약만 보여 준다", () => {
    const report = formatReport([passed, failed]);
    expect(report).toContain("✗ test\n1 failed");
    expect(report).not.toContain("noise");
    expect(report.endsWith("check 실패: test (통과 1/2)")).toBe(true);
  });
});
