import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { fixtureRepository, git, temporaryFolder } from "./helpers.ts";

it.skipIf(process.platform === "win32")(
  "CI 측정기의 실제 Git 호출은 다른 저장소를 지정한 여덟 환경 변수를 제거한다",
  async () => {
    const own = fixtureRepository(),
      foreign = fixtureRepository(),
      output = temporaryFolder();
    const { measures } = (await import("./nestjs-probe-ci-support.mjs")) as {
      measures: (path: string) => {
        run: (
          label: string,
          command: string,
          args: string[],
          options: { cwd: string; env: NodeJS.ProcessEnv },
        ) => { stdout: string; row: { nativeExit: number } };
      };
    };
    const result = measures(output).run("owned-git", "git", ["rev-parse", "--show-toplevel"], {
      cwd: own,
      env: {
        GIT_DIR: join(foreign, ".git"),
        GIT_WORK_TREE: foreign,
        GIT_INDEX_FILE: join(foreign, ".git/index"),
        GIT_COMMON_DIR: join(foreign, ".git"),
        GIT_OBJECT_DIRECTORY: join(foreign, ".git/objects"),
        GIT_ALTERNATE_OBJECT_DIRECTORIES: join(foreign, ".git/objects"),
        GIT_NAMESPACE: "foreign",
        GIT_PREFIX: "foreign/",
      },
    });
    expect(result.row.nativeExit).toBe(0);
    expect(result.stdout.trim()).toBe(git(own, "rev-parse", "--show-toplevel").trim());
  },
);
it("CI 생성 차이 측정은 실제 부분·전체 계약을 읽고 실행 증거 JSON을 만든다", async () => {
  const root = resolve(import.meta.dirname, "../.."),
    directory = temporaryFolder();
  const { frontendDifferences } = (await import("./nestjs-probe-ci-support.mjs")) as {
    frontendDifferences: (
      clone: string,
      target: string,
      api: string,
      frontends: string[],
      run: () => never,
      directory: string,
      id: string,
    ) => void;
  };
  frontendDifferences(
    root,
    directory,
    join(root, "prototypes/nestjs"),
    [],
    () => {
      throw Error("No native command expected for zero frontends");
    },
    directory,
    "inert",
  );
  const result = JSON.parse(
    readFileSync(join(directory, "frontend-gen-differences.json"), "utf8"),
  ) as {
    apiOperations: string[];
    apiSchemas: string[];
    contractOperations: string[];
    contractSchemas: string[];
    missingOperations: string[];
    missingSchemas: string[];
    generatedFrontendDifferences: unknown[];
  };
  expect(result.apiOperations).toHaveLength(19);
  expect(result.apiSchemas).toHaveLength(83);
  expect(result.contractOperations).toHaveLength(39);
  expect(result.contractSchemas).toHaveLength(126);
  expect(result.missingOperations).toHaveLength(20);
  expect(result.missingSchemas).toHaveLength(43);
  expect(result.generatedFrontendDifferences).toEqual([]);
});
