import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, chmodSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { fixtureRepository, temporaryFolder, write } from "./helpers.ts";
import { selectFrontendSteps } from "../src/frontend-config.ts";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";

interface Workflow {
  jobs: Record<
    string,
    {
      steps: {
        name?: string;
        run?: string;
        env?: Record<string, string>;
        "working-directory"?: string;
      }[];
    }
  >;
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
  const selected = parse(
    selectFrontendSteps(
      readFileSync(resolve(root, "create/assets/combo/.github/workflows/ci.yml"), "utf8"),
      ["web", "admin"],
    ),
  ) as Workflow;
  const combo = commands(selected.jobs.check);
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
it.skipIf(!existsSync(bash))(
  "native SDK installation works without sdkmanager on PATH and preserves package arguments",
  () => {
    const fixture = temporaryFolder(),
      sdk = join(fixture, "SDK with spaces").replaceAll("\\", "/"),
      calls = join(fixture, "sdk-calls").replaceAll("\\", "/");
    write(
      fixture,
      "SDK with spaces/cmdline-tools/latest/bin/sdkmanager",
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$CALLS"\n',
    );
    chmodSync(join(sdk, "cmdline-tools/latest/bin/sdkmanager"), 0o755);
    const native = JSON.parse(
      readFileSync(resolve(root, "create/assets/combo/mobile-only/native-ci.json"), "utf8"),
    ) as Workflow["jobs"];
    const jobs = [
      workflow(".github/workflows/ci.yml").jobs["expo-android"],
      workflow("templates/expo/.github/workflows/ci.yml").jobs.android,
      native.android,
    ];
    for (const job of jobs) {
      const run = job?.steps.find(
        (step) => step.name === "Install pinned native Android platform tools",
      )?.run;
      if (!run) throw new Error("Native SDK installation missing");
      const result = spawnSync(bash, ["-c", `set -e\nsdkmanager() { return 127; }\n${run}`], {
        env: { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, CALLS: calls },
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(calls, "utf8").trim().split("\n")).toEqual([
        "platforms;android-37.0",
        "build-tools;37.0.0",
        "cmake;3.22.1",
        "ndk;27.1.12297006",
      ]);
    }
  },
);
it.each([
  {
    kind: "create",
    folder: "create",
    file: "test/expo-smoke.ts",
    event: "test:expo",
    job: "create-expo",
  },
  {
    kind: "ios",
    folder: "templates/expo",
    file: "scripts/native/ci-ios.mjs",
    event: "test:ci:ios",
    job: "expo-ios",
  },
])(
  "$kind CI receives the actual pnpm lifecycle executable",
  async ({ folder, file, event, job }) => {
    const fixture = temporaryFolder();
    write(fixture, "package.json", '{"private":true}\n');
    write(
      fixture,
      `${folder}/package.json`,
      readFileSync(resolve(root, `${folder}/package.json`), "utf8"),
    );
    write(
      fixture,
      `${folder}/${file}`,
      `import {writeFileSync} from 'node:fs'; if(!process.env.npm_execpath || process.env.npm_lifecycle_event !== ${JSON.stringify(event)}) throw new Error('Missing pnpm lifecycle executable: '+JSON.stringify({hasEntry:!!process.env.npm_execpath,event:process.env.npm_lifecycle_event})); writeFileSync('passed',process.env.npm_execpath);\n`,
    );
    const helper = (await import(
      pathToFileURL(resolve(root, "create/assets/combo/scripts/process.mjs")).href
    )) as { pnpmEntry(): string };
    const entry = helper.pnpmEntry(),
      javascript = /\.[cm]?js$/.test(entry);
    const step = workflow(".github/workflows/ci.yml").jobs[job]?.steps.at(-1),
      run = step?.run;
    if (!run?.startsWith("pnpm "))
      throw new Error("CI must run through the declared pnpm lifecycle");
    const args = run.trim().split(/\s+/).slice(1);
    const inherited = { ...gitEnvironment(), NPM_LIFECYCLE_EVENT: "outer-parent" };
    const result = spawnSync(
      javascript ? process.execPath : entry,
      javascript ? [entry, ...args] : args,
      {
        cwd: step?.["working-directory"] ? join(fixture, step["working-directory"]) : fixture,
        env: Object.fromEntries(
          Object.entries(inherited).filter(
            ([key]) =>
              !/^(npm_execpath|npm_lifecycle_event|npm_lifecycle_script|npm_command)$/i.test(key),
          ),
        ),
        encoding: "utf8",
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(fixture, folder, "passed"), "utf8")).toBeTruthy();
  },
);
it.skipIf(!existsSync(bash))("작업 트리가 바뀌면 CI는 해결 방법을 stderr로 알리고 실패한다", () => {
  const step = workflow(".github/workflows/ci.yml").jobs["create-combo"]?.steps.find(
    (step) => step.name === "생성 프로젝트의 작업 트리 확인",
  );
  const script = step?.run;
  if (!script) throw new Error("작업 트리 확인 단계가 없다");
  const repository = fixtureRepository();
  const run = () =>
    spawnSync(bash, ["-e", "-c", script], {
      cwd: repository,
      env: gitEnvironment(),
      encoding: "utf8",
    });
  // fixture의 무추적 파일도 오염으로 검출한다.
  const dirty = run();
  expect(dirty.status).toBe(1);
  expect(dirty.stdout).toContain("templates/nextjs/untracked.txt");
  expect(dirty.stderr.trim()).toBe(
    "생성 프로젝트의 작업 트리가 바뀌었다 — 도구가 쓴 파일을 끄거나 ignore에 더한다.",
  );
  write(repository, ".git/info/exclude", "templates/nextjs/untracked.txt\n");
  const clean = run();
  expect(clean.status).toBe(0);
  expect(clean.stdout).toBe("");
  expect(clean.stderr).toBe("");
});

it.skipIf(!existsSync(bash)).each(["web", "admin"])(
  "CI는 기존 컨테이너를 발견하면 trap·실행·삭제 전에 거절한다: %s",
  (app) => {
    const step = workflow(".github/workflows/ci.yml").jobs["create-combo"]?.steps.find(
      (step) => step.name === `조합 ${app} 컨테이너 시작 확인`,
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
    expect(readFileSync(calls, "utf8").trim()).toBe(
      `container inspect aitpl-combo-${app}-fixture-1`,
    );
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/ — /);
  },
);

it("CI는 모든 앱의 실제 검증과 두 단일 프론트의 생성 전용 검증을 구분한다", () => {
  const steps = workflow(".github/workflows/ci.yml").jobs["create-combo"]?.steps ?? [];
  expect(
    steps.some(
      (step) =>
        step.run ===
        'pnpm new "$RUNNER_TEMP/aitpl-combo" --api fastapi --web --admin --name ci-combo',
    ),
  ).toBe(true);
  for (const app of ["web", "admin"]) {
    expect(
      steps.some(
        (step) => step.run === `pnpm --filter ${app} exec playwright install-deps chromium`,
      ),
    ).toBe(true);
    const generation = steps.find((step) =>
      step.run?.startsWith(`pnpm new "$RUNNER_TEMP/aitpl-combo-${app}"`),
    );
    expect(generation?.run).toContain(`--api fastapi --${app} --name`);
    expect(generation?.run).not.toContain(app === "web" ? "--admin" : "--web");
    const runs = steps
      .filter((step) => step["working-directory"]?.endsWith(`/aitpl-combo-${app}`))
      .map((step) => step.run);
    expect(runs).toEqual([
      "node --test scripts/*.test.mjs .claude/hooks/*.test.mjs",
      "pnpm exec turbo run check --dry=json",
    ]);
  }
  const admin = steps.find((step) => step.name === "조합 admin 컨테이너 시작 확인");
  expect(admin?.run).toContain("--publish 127.0.0.1:3201:3001");
  expect(admin?.run).toContain("curl --location --silent");
  expect(admin?.run).toContain("= 200 ];");
});
