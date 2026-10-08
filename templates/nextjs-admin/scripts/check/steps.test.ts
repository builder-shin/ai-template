import { expect, it } from "vitest";
import { assembleSteps } from "./steps";
import { runChecks } from "./runner";

function stepKey(steps: ReturnType<typeof assembleSteps>, name: string) {
  const step = steps.find((item) => item.name === name);
  if (!step) throw new Error(`검사 단계가 없다: ${name}`);
  return step.key;
}

it("선택한 계약의 검사 경로와 입력을 캐시에 반영한다", () => {
  const contract = {
    mock: "../../contract/mock",
    typespec: "../../contract/typespec",
    files: { "mock/src/main.ts": "before" },
  };
  const steps = assembleSteps({}, false, [], {}, {}, "", contract);
  expect(steps.find((step) => step.name === "contract-mock")?.args).toEqual([
    "--dir",
    contract.mock,
    "run",
    "check",
  ]);
  expect(steps.find((step) => step.name === "contract-typespec")?.args).toEqual([
    "--dir",
    contract.typespec,
    "run",
    "check",
  ]);
  const changed = assembleSteps({}, false, [], {}, {}, "", {
    ...contract,
    files: { "mock/src/main.ts": "after" },
  });
  for (const name of ["tests", "generated", "contract-mock", "contract-typespec"])
    expect(steps.find((step) => step.name === name)?.key).not.toBe(
      changed.find((step) => step.name === name)?.key,
    );
});

it.each(["e2e/fixtures.ts", "e2e/targets/fastapi.ts"])(
  "%s 변경은 전체 테스트 캐시를 무효화한다",
  (path) => {
    const key = (value: string) => stepKey(assembleSteps({ [path]: value }, false, []), "tests");
    expect(key("before")).not.toBe(key("after"));
  },
);

it("설정 오류는 캐시와 관계없이 generated 단계의 실패로 출력한다", async () => {
  const problem = new Error("gen.config.json 설정이 잘못됐다 — 상대 경로를 넣는다.");
  const steps = assembleSteps({}, true, [], {}, {}, problem);
  const previous = Object.fromEntries(steps.map((step) => [step.name, step.key]));
  const result = await runChecks(steps, previous, async () => ({ ok: true, output: "" }));
  expect(result.ok).toBe(false);
  expect(result.output).toBe(`✗ generated\n${problem.message}`);
  expect(result.cache.generated).toBeUndefined();
});

it.each([false, true])(
  "백엔드 스펙과 입력 설정 변경은 생성물 캐시를 무효화한다 (fast=%s)",
  (fast) => {
    const key = (files: Record<string, string>, openapi = "before") =>
      stepKey(assembleSteps(files, fast, [], {}, {}, openapi), "generated");
    expect(key({}, "before")).not.toBe(key({}, "after"));
    expect(key({ "gen.config.json": "before" })).not.toBe(key({ "gen.config.json": "after" }));
    expect(key({ "gen.config.json": "before" })).not.toBe(key({}));
  },
);

it.each([false, true])("hook과 권한 변경은 테스트 캐시를 무효화한다 (fast=%s)", (fast) => {
  const related = fast ? ["src/lib/env.ts"] : [];
  const name = fast ? "related-tests" : "tests";
  for (const path of [".claude/hooks/pre-tool-use.mjs", ".claude/settings.json"]) {
    const key = (files: Record<string, string>) =>
      stepKey(assembleSteps(files, fast, related), name);
    expect(key({ [path]: "before" })).not.toBe(key({ [path]: "after" }));
    expect(key({ [path]: "before" })).not.toBe(key({}));
  }
});

it.each([false, true])(
  "타입 검사 입력과 현재 route 생성물 변경은 캐시를 무효화한다 (fast=%s)",
  (fast) => {
    const key = (files: Record<string, string>, routeTypes: Record<string, string> = {}) =>
      stepKey(assembleSteps(files, fast, [], routeTypes), "types");
    for (const path of ["src/app/page.tsx", "next.config.ts", "tsconfig.check.json"]) {
      expect(key({ [path]: "before" })).not.toBe(key({ [path]: "after" }));
    }
    expect(key({}, { "validator.ts": "before" })).not.toBe(key({}, { "validator.ts": "after" }));
  },
);

const installedChanges: [string, Record<string, string>][] = [
  ["패키지 삭제", {}],
  ["설치 버전 변경", { "node_modules/next/package.json": "16.3.9" }],
  [
    "설치 skill 변경",
    {
      "node_modules/next/package.json": "16.3.8",
      "node_modules/@playwright/cli/skills/playwright-cli/SKILL.md": "changed-digest",
    },
  ],
];

it.each(installedChanges)(
  "설치 상태만 바뀌면 harness 성공 캐시를 쓰지 않는다: %s",
  async (_name, changed) => {
    const files = { "AGENTS.md": "# 지침\n" };
    const initial = { "node_modules/next/package.json": "16.3.8" };
    const calls: string[] = [];
    const execute = async (step: { name: string }) => {
      calls.push(step.name);
      return { ok: true, output: "" };
    };
    const first = await runChecks(assembleSteps(files, false, [], {}, initial), {}, execute);
    calls.length = 0;
    const cached = await runChecks(
      assembleSteps(files, false, [], {}, initial),
      first.cache,
      execute,
    );
    expect(cached.output).toContain("9 캐시");
    expect(calls).toEqual([]);
    const updated = await runChecks(
      assembleSteps(files, false, [], {}, changed),
      first.cache,
      execute,
    );
    expect(updated.ok).toBe(true);
    expect(calls).toEqual(["harness"]);
    expect(updated.output).toContain("8 캐시");
  },
);
