import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createProject } from "../src/create.ts";
import { findRepository, templateFiles } from "../src/repository.ts";
import { runGit } from "../src/git.ts";
import { fixtureRepository, git, temporaryFolder, write } from "./helpers.ts";

function request(target: string, template: "nextjs" | "fastapi" = "nextjs", initialize = true) {
  return { target, template, name: "my-project", git: initialize };
}

describe("단독 프로젝트", () => {
  it.each(["nextjs", "fastapi"] as const)(
    "%s의 파일만 만들고 main 첫 커밋을 남긴다",
    (template) => {
      const root = fixtureRepository();
      expect(git(root, "status", "--porcelain", "--untracked-files=no")).toBe("");
      if (template === "nextjs") {
        expect(templateFiles(root, template).find((file) => file.path === "bin/start.sh")).toEqual({
          path: "bin/start.sh",
          executable: true,
        });
      }
      const target = join(temporaryFolder(), "aitpl-app");
      const result = createProject(request(target, template), root);
      expect(result.committed).toBe(true);
      expect(git(target, "status", "--porcelain")).toBe("");
      expect(git(target, "branch", "--show-current").trim()).toBe("main");
      expect(git(target, "rev-list", "--count", "HEAD").trim()).toBe("1");
      expect(git(target, "log", "-1", "--format=%s").trim()).toBe(
        `chore: create my-project from ai-template ${git(root, "rev-parse", "--short", "HEAD").trim()}`,
      );
      expect(readFileSync(join(target, "README.md"), "utf8")).toBe("# my-project\n\n내용\n");
      expect(existsSync(join(target, "template.json"))).toBe(false);
      expect(existsSync(join(target, "untracked.txt"))).toBe(false);
      if (template === "nextjs") {
        expect(readFileSync(join(target, "package.json"), "utf8")).toBe(
          '{\n  "name": "my-project",\n  "private": true\n}\n',
        );
        expect(readFileSync(join(target, "docs/공백 문서.md"))).toEqual(
          readFileSync(join(root, "templates/nextjs/docs/공백 문서.md")),
        );
        expect(readFileSync(join(target, "pnpm-lock.yaml"))).toEqual(
          readFileSync(join(root, "templates/nextjs/pnpm-lock.yaml")),
        );
        if (process.platform !== "win32")
          expect(statSync(join(target, "bin/start.sh")).mode & 0o111).toBe(0o111);
      } else {
        expect(readFileSync(join(target, "compose.yaml"), "utf8")).toBe(
          "# 폴더와 관계없이 compose 프로젝트와 볼륨 이름을 프로젝트 이름으로 고정한다.\nname: my-project\n# 개발 인프라\nx-app: &app\n  image: my-project-app # 이미지\nservices:\n  api:\n    <<: *app\n  postgres:\n    image: postgres:18\n",
        );
        expect(readFileSync(join(target, "pyproject.toml"), "utf8")).toBe(
          '[project]\nname = "app"\n',
        );
        expect(readFileSync(join(target, "uv.lock"))).toEqual(
          readFileSync(join(root, "templates/fastapi/uv.lock")),
        );
      }
    },
  );

  it("기존 빈 폴더에 git 없이 생성한다", () => {
    const root = fixtureRepository();
    const target = temporaryFolder();
    createProject(request(target, "nextjs", false), root);
    expect(existsSync(join(target, "package.json"))).toBe(true);
    expect(existsSync(join(target, ".git"))).toBe(false);
  });

  it("compose 이름을 고정한 템플릿은 거절하고 대상·임시 폴더를 남기지 않는다", () => {
    const root = fixtureRepository();
    const path = join(root, "templates/fastapi/compose.yaml");
    writeFileSync(path, "name: fastapi\n" + readFileSync(path, "utf8"));
    git(root, "add", "templates/fastapi/compose.yaml");
    git(root, "-c", "commit.gpgsign=false", "commit", "-m", "chore: pinned compose fixture");
    const parent = temporaryFolder();
    expect(() => createProject(request(join(parent, "aitpl-app"), "fastapi"), root)).toThrow(
      /^pnpm new: .*compose.*name.* — .*볼륨.*$/,
    );
    expect(readdirSync(parent)).toEqual([]);
  });

  it.each(["nextjs", "fastapi"] as const)(
    "%s 첫 커밋은 전역 excludes와 무관하게 복사한 파일을 포함한다",
    (template) => {
      const root = fixtureRepository();
      for (const file of [".env.example", ".claude/settings.json", ".mcp.json"])
        write(root, `templates/${template}/${file}`, "{}\n");
      git(root, "add", "--", "templates");
      git(root, "-c", "commit.gpgsign=false", "commit", "-m", "chore: ignored template fixture");
      const settings = temporaryFolder();
      const excludes = join(settings, "excludes");
      write(settings, "excludes", ".env*\n.claude/\n.mcp.json\n");
      write(
        settings,
        "gitconfig",
        "[user]\nname = Fixture\nemail = fixture@example.com\n[commit]\ngpgsign = false\n[core]\nexcludesFile = " +
          JSON.stringify(excludes.replaceAll("\\", "/")) +
          "\n",
      );
      vi.stubEnv("GIT_CONFIG_GLOBAL", join(settings, "gitconfig"));
      const target = join(temporaryFolder(), "aitpl-app");
      expect(createProject(request(target, template), root).committed).toBe(true);
      const files = git(target, "ls-files", "-z").split("\0").filter(Boolean).sort();
      expect(files).toEqual(
        templateFiles(root, template)
          .map((file) => file.path)
          .sort(),
      );
      expect(files).toEqual(
        expect.arrayContaining([".env.example", ".claude/settings.json", ".mcp.json"]),
      );
      expect(git(target, "status", "--porcelain")).toBe("");
    },
  );

  it("git 사용자 정보가 없으면 init만 남긴다", () => {
    const root = fixtureRepository();
    const config = join(temporaryFolder(), "empty-config");
    writeFileSync(config, "");
    vi.stubEnv("GIT_CONFIG_GLOBAL", config);
    vi.stubEnv("EMAIL", "implicit@example.com");
    const target = join(temporaryFolder(), "aitpl-app");
    expect(createProject(request(target), root).committed).toBe(false);
    expect(existsSync(join(target, ".git"))).toBe(true);
    expect(git(target, "status", "--porcelain")).toContain("?? README.md");
  });

  it("hook의 git 환경이 원본과 생성 대상의 저장소를 바꾸지 않는다", () => {
    const root = fixtureRepository();
    const before = readFileSync(join(root, ".git/config"));
    for (const key of [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_COMMON_DIR",
      "GIT_NAMESPACE",
      "GIT_PREFIX",
    ]) {
      vi.stubEnv(key, join(root, "wrong"));
    }
    const target = join(temporaryFolder(), "aitpl-app");
    createProject(request(target), root);
    expect(git(target, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(root, ".git/config"))).toEqual(before);
    expect(findRepository(pathToFileURL(join(root, "create/src/cli.ts")).href)).toBe(root);
  });

  it("CLI 위치에서 계산한 루트가 git 루트와 다르면 거절한다", () => {
    const root = fixtureRepository();
    write(root, "nested/create/src/cli.ts", "");
    expect(() =>
      findRepository(pathToFileURL(join(root, "nested/create/src/cli.ts")).href),
    ).toThrow(/배치/);
  });

  it.skipIf(process.platform !== "win32")(
    "Windows CLI 경로의 대소문자가 달라도 저장소를 찾는다",
    () => {
      const root = fixtureRepository();
      const location = pathToFileURL(join(root.toLowerCase(), "create/src/cli.ts")).href;
      expect(findRepository(location)).toBe(root);
    },
  );

  it.each(["unstaged", "staged", "deleted"])("추적 파일 변경을 거절한다: %s", (change) => {
    const root = fixtureRepository();
    write(root, "templates/nextjs/README.md", "# changed\n");
    if (change === "staged") git(root, "add", "templates/nextjs/README.md");
    if (change === "deleted") git(root, "rm", "-f", "templates/nextjs/README.md");
    const target = join(temporaryFolder(), "aitpl-app");
    expect(() => createProject(request(target), root)).toThrow(/커밋/);
    expect(existsSync(target)).toBe(false);
  });

  it("선택하지 않은 템플릿의 변경은 허용한다", () => {
    const root = fixtureRepository();
    write(root, "templates/fastapi/README.md", "# changed\n");
    expect(templateFiles(root, "nextjs").map((file) => file.path)).toContain("docs/공백 문서.md");
  });

  it("비어 있지 않은 대상과 파일을 보존하며 거절한다", () => {
    const root = fixtureRepository();
    const target = temporaryFolder();
    write(target, "keep.txt", "keep\n");
    expect(() => createProject(request(target), root)).toThrow(/비어|대상/);
    expect(readdirSync(target)).toEqual(["keep.txt"]);
    expect(() => createProject(request(join(target, "keep.txt")), root)).toThrow(/대상/);
  });

  it.skipIf(process.platform !== "win32").each(["root", "child"])(
    "없는 드라이브의 %s 경로는 명확한 오류로 거절한다",
    (kind) => {
      const root = fixtureRepository();
      const drive = "QRSTUVWXYZABCDEFGHIJKLMNOP"
        .split("")
        .find((letter) => !existsSync(`${letter}:\\`));
      if (!drive) throw new Error("없는 드라이브가 필요하다");
      const target = kind === "root" ? `${drive}:\\` : `${drive}:\\aitpl-app`;
      expect(() => createProject(request(target), root)).toThrow(
        /^pnpm new: 대상 폴더의 드라이브나 공유를 찾을 수 없다 — .+$/,
      );
      expect(existsSync(target)).toBe(false);
    },
  );

  it("저장소 안이나 링크를 거쳐 저장소 안에 생성하는 것을 거절한다", () => {
    const root = fixtureRepository();
    expect(() => createProject(request(join(root, "aitpl-nested")), root)).toThrow(/저장소/);
    const outside = temporaryFolder();
    symlinkSync(root, join(outside, "link"), process.platform === "win32" ? "junction" : "dir");
    expect(() => createProject(request(join(outside, "link/aitpl-nested")), root)).toThrow(
      /저장소/,
    );
    expect(existsSync(join(root, "aitpl-nested"))).toBe(false);
  });

  it("복사 뒤 이름 변경 실패도 임시 폴더를 정리한다", () => {
    const root = fixtureRepository();
    write(root, "templates/nextjs/package.json", "invalid json\n");
    git(root, "add", "templates");
    git(root, "-c", "commit.gpgsign=false", "commit", "-m", "chore: invalid fixture");
    const parent = temporaryFolder();
    expect(() => createProject(request(join(parent, "aitpl-app")), root)).toThrow();
    expect(readdirSync(parent)).toEqual([]);
  });

  it("서명 설정을 따르고 커밋 실패 시 생성 대상을 정리한다", () => {
    const root = fixtureRepository();
    const config = process.env.GIT_CONFIG_GLOBAL;
    if (!config) throw new Error("fixture 설정이 없다");
    writeFileSync(
      config,
      "[user]\nname = Fixture\nemail = fixture@example.com\n[commit]\ngpgsign = true\n[gpg]\nprogram = aitpl-missing-signing-program\n",
    );
    const parent = temporaryFolder();
    expect(() => createProject(request(join(parent, "aitpl-app")), root)).toThrow(/git/);
    expect(readdirSync(parent)).toEqual([]);
  });

  it("git이 없으면 대상도 만들지 않는다", () => {
    const root = fixtureRepository();
    vi.stubEnv("PATH", "");
    const parent = temporaryFolder();
    expect(() => createProject(request(join(parent, "aitpl-app")), root)).toThrow(/git.*설치/);
    expect(readdirSync(parent)).toEqual([]);
  });

  it("git 실패 메시지에 stderr의 첫 줄을 남긴다", () => {
    const root = fixtureRepository();
    expect(() => runGit(root, ["cat-file", "-p", "aitpl-missing-object"])).toThrow(
      /pnpm new: git cat-file.*aitpl-missing-object.* — .+/,
    );
  });
});
