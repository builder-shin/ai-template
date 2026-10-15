import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createProject } from "../src/create.ts";
import { nestjsFixture, sourceText } from "./nestjs-fixture.ts";
import { git, temporaryFolder, write } from "./helpers.ts";

it("단독 NestJS는 compose 이름·이미지만 바꾸고 앱 문맥 Dockerfile과 추적 파일을 보존한다", () => {
  const root = nestjsFixture(),
    target = join(temporaryFolder(), "aitpl-nest");
  write(root, "templates/nestjs/untracked.txt", "복사하지 않는다\n");
  const result = createProject({ target, name: "my-nest", template: "nestjs", git: true }, root);
  expect(result.committed).toBe(true);
  const before = sourceText(root, "templates/nestjs/compose.yaml");
  expect(sourceText(target, "compose.yaml")).toBe(
    "# 폴더와 관계없이 compose 프로젝트와 볼륨 이름을 프로젝트 이름으로 고정한다.\nname: my-nest\n" +
      before.replace("fastapi-template-app", "my-nest-app"),
  );
  expect(JSON.parse(sourceText(target, "package.json"))).toMatchObject({
    name: "my-nest",
    scripts: { build: "nest build" },
  });
  for (const path of ["Dockerfile", ".dockerignore", "pnpm-lock.yaml"])
    expect(readFileSync(join(target, path))).toEqual(
      readFileSync(join(root, "templates/nestjs", path)),
    );
  expect(readdirSync(target)).not.toContain("untracked.txt");
  expect(existsSync(join(target, "template.json"))).toBe(false);
  expect(git(target, "status", "--porcelain")).toBe("");
});
