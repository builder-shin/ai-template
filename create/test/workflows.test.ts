import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { temporaryFolder } from "./helpers.ts";

interface Workflow {
  jobs: Record<string, { steps: { name?: string; run?: string; env?: Record<string, string> }[] }>;
}
const root = resolve(import.meta.dirname, "../..");
const workflow = (file: string) => parse(readFileSync(resolve(root, file), "utf8")) as Workflow;

it("조합 CI는 에이전트 환경 검사와 E2E 뒤 작업 트리 오염을 확인한다", () => {
  const steps = workflow(".github/workflows/ci.yml").jobs["create-combo"]?.steps ?? [];
  expect(steps.find((step) => step.run === "pnpm check")?.env).toEqual({ AI_AGENT: "1" });
  const e2e = steps.findIndex((step) => step.run === "pnpm test:e2e");
  const clean = steps.findIndex((step) => step.run?.includes("git status --porcelain"));
  expect(clean).toBeGreaterThan(e2e);
  expect(steps[clean]?.run).toContain("exit 1");
});

it("조합 workflow의 run 명령은 create-combo가 같은 순서로 검증한다", () => {
  const commands = (job: Workflow["jobs"][string] | undefined) =>
    job?.steps.flatMap((step) => (step.run ? [step.run.replace(/ --tag \S+/, "")] : [])) ?? [];
  const combo = commands(workflow("create/assets/combo/.github/workflows/ci.yml").jobs.check);
  const ci = commands(workflow(".github/workflows/ci.yml").jobs["create-combo"]);
  expect(combo.length).toBeGreaterThan(0);
  let previous = -1;
  for (const command of combo) {
    const index = ci.indexOf(command, previous + 1);
    expect(index, command).toBeGreaterThan(previous);
    previous = index;
  }
});

const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/bash";
it.skipIf(!existsSync(bash))("CI는 기존 컨테이너를 발견하면 trap·실행·삭제 전에 거절한다", () => {
  const step = workflow(".github/workflows/ci.yml").jobs["create-combo"]?.steps.find(
    (step) => step.name === "조합 web 컨테이너 시작 확인",
  );
  const run = step?.run;
  if (!run) throw new Error("컨테이너 검증 단계가 없다");
  // 셸 함수만 호출한다. Docker 실행 파일은 사용하지 않는다.
  const calls = join(temporaryFolder(), "calls.log").replaceAll("\\", "/");
  const script = `set -e\ndocker() { printf '%s\\n' "$*" >> "$CALLS"; [ "$1" = container ]; }\nopenssl() { printf 'fixture'; }\n${run}`;
  const result = spawnSync(bash, ["-c", script], {
    encoding: "utf8",
    env: { ...process.env, CALLS: calls, GITHUB_RUN_ID: "fixture", GITHUB_RUN_ATTEMPT: "1" },
  });
  expect(result.status).toBe(1);
  expect(readFileSync(calls, "utf8").trim()).toBe("container inspect aitpl-combo-web-fixture-1");
  expect(result.stdout).toBe("");
  expect(result.stderr).toMatch(/ — /);
});
