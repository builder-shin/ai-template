import { describe, expect, it } from "vitest";
import { fingerprint, runChecks, parseCheckArgs, type Step } from "./runner";

describe("check 실행기", () => {
  it("pnpm이 --를 소비해도 빠른 검사에 관련 파일을 넘긴다", () => {
    expect(parseCheckArgs(["--fast", "src/lib/env.ts"])).toEqual({
      fast: true,
      related: ["src/lib/env.ts"],
    });
    expect(parseCheckArgs(["--fast", "--", "src/lib/env.ts"])).toEqual({
      fast: true,
      related: ["src/lib/env.ts"],
    });
    expect(parseCheckArgs([])).toEqual({ fast: false, related: [] });
  });
  it("성공만 캐시하고 바뀐 단계만 다시 검사한다", async () => {
    const calls: string[] = [];
    const execute = async (step: Step) => {
      calls.push(step.name);
      return { ok: step.name !== "bad", output: `${step.name} output` };
    };
    const steps: Step[] = [
      { name: "format", args: [], key: "one" },
      { name: "bad", args: [], key: "two" },
    ];
    const first = await runChecks(steps, {}, execute);
    expect(first.ok).toBe(false);
    expect(first.output).toContain("bad output");
    expect(first.output).not.toContain("format output");
    calls.length = 0;
    await runChecks(steps, first.cache, execute);
    expect(calls).toEqual(["bad"]);
    calls.length = 0;
    await runChecks([{ ...steps[0]!, key: "changed" }], first.cache, execute);
    expect(calls).toEqual(["format"]);
  });
  it("성공은 한 줄이고 파일 삭제와 내용 변경도 캐시를 무효화한다", async () => {
    const result = await runChecks([], {}, async () => ({ ok: true, output: "noise" }));
    expect(result.output.trim().split("\n")).toHaveLength(1);
    expect(fingerprint({ a: "one" })).not.toBe(fingerprint({ a: "two" }));
    expect(fingerprint({ a: "one" })).not.toBe(fingerprint({}));
    expect(fingerprint({ a: "one", b: "two" })).toBe(fingerprint({ b: "two", a: "one" }));
  });
});
