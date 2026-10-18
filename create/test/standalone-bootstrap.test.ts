import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";

interface Step {
  run?: string;
  "working-directory"?: string;
}
const workflow = parse(
  readFileSync(resolve(import.meta.dirname, "../../.github/workflows/ci.yml"), "utf8"),
) as {
  jobs: Record<string, { env: Record<string, string>; steps: Step[] }>;
};

it.each([
  "aitpl-nextjs",
  "aitpl-admin",
  "aitpl-ci-nest-standalone-${{ github.run_id }}-${{ github.run_attempt }}/project",
])("단독 CI는 frozen 설치를 마친 뒤 오류 보호를 유지한 채 준비한다: %s", (project) => {
  const job = workflow.jobs["create-standalone"];
  if (!job) throw new Error("단독 생성 CI가 없다");
  const steps = job.steps.filter(
    (step) => step["working-directory"] === `\${{ runner.temp }}/${project}`,
  );
  // CI의 실제 명령을 실행하되 설치와 인프라 대신 셸 함수로 의존성 상태만 재현한다.
  const commands = steps
    .filter((step) => (step.run ?? "").startsWith("pnpm install") || step.run === "pnpm setup")
    .map((step) => step.run);
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/bash";
  const result = spawnSync(
    bash,
    [
      "-e",
      "-c",
      `
      installed=false
      pnpm() {
        if [ "$*" = 'install --frozen-lockfile' ]; then installed=true; printf 'install\\n';
        elif [ "$*" = setup ] && [ "$installed" = true ]; then printf 'setup\\n';
        else printf '의존성을 먼저 설치한다\\n' >&2; return 1; fi
      }
      ${commands.join("\n")}
    `,
    ],
    { encoding: "utf8", env: { ...process.env, ...job.env } },
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("install\nsetup\n");
  for (const key of [
    "npm_config_verify_deps_before_run",
    "PNPM_VERIFY_DEPS_BEFORE_RUN",
    "PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN",
  ])
    expect(job.env[key]).toBe("error");
});
