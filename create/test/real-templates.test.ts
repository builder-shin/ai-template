import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";
import { createProject } from "../src/create.ts";
import { git, temporaryFolder } from "./helpers.ts";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);

it("두 실제 템플릿의 파일 목록·이름·나머지 바이트와 git 상태를 확인한다", () => {
  const parent = temporaryFolder();
  for (const template of ["fastapi", "nextjs"] as const) {
    const name = `aitpl-real-${template}`;
    const target = join(parent, name);
    createProject({ target, name, template, git: true }, root);
    const expected = git(root, "ls-files", "-z", "--", `templates/${template}`)
      .split("\0")
      .filter(Boolean)
      .map((file) => file.slice(`templates/${template}/`.length))
      .filter((file) => file !== "template.json")
      .sort();
    expect(git(target, "ls-files", "-z").split("\0").filter(Boolean).sort()).toEqual(expected);
    expect(git(target, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(target, "README.md"), "utf8").split("\n")[0]).toBe(`# ${name}`);
    const renamed = template === "nextjs" ? "package.json" : "compose.yaml";
    for (const file of expected.filter((file) => !["README.md", renamed].includes(file))) {
      expect(readFileSync(join(target, file)), file).toEqual(
        readFileSync(join(root, "templates", template, file)),
      );
    }
    if (template === "nextjs") {
      expect(JSON.parse(readFileSync(join(target, "package.json"), "utf8"))).toMatchObject({
        name,
      });
    } else {
      const compose = readFileSync(join(target, "compose.yaml"), "utf8");
      expect(compose).toContain(`name: ${name}\n`);
      expect(compose).toContain(`image: ${name}-app\n`);
    }
  }
});

it("실제 CLI의 도움말·사용법 오류·실행 오류는 서로 다른 종료 코드다", () => {
  const parent = temporaryFolder();
  const run = (args: string[], env: NodeJS.ProcessEnv = process.env) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(require.resolve("tsx")).href,
        join(root, "create/src/cli.ts"),
        ...args,
      ],
      { cwd: parent, env: gitEnvironment(env), encoding: "utf8" },
    );
  const help = run(["--help"], { ...process.env, PATH: "" });
  expect(help.status, help.stderr).toBe(0);
  expect(help.stdout).toContain("사용법");
  const usage = run(["--template", "bad"]);
  expect(usage.status).toBe(2);
  expect(usage.stderr).toMatch(/pnpm new: .+ — .+/);
  const failure = run([root, "--template", "nextjs", "--name", "my-web"]);
  expect(failure.status).toBe(1);
  expect(failure.stderr).toMatch(/pnpm new: .*저장소.* — .+/);
  const success = run(["aitpl-cli", "--template", "nextjs", "--no-git"], {
    ...process.env,
    INIT_CWD: parent,
  });
  expect(success.status, success.stderr).toBe(0);
  expect(success.stdout).toContain(join(parent, "aitpl-cli"));
  expect(success.stdout).toContain("pnpm setup");
  expect(readdirSync(join(parent, "aitpl-cli"))).not.toContain(".git");
});
