import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { pnpm } from "./process.mjs";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
let temporary: string;
let project: string;
let copiedTools: typeof import("./process.mjs");
function run(name: string, ...args: string[]) {
  return copiedTools.pnpm(["gen:feature", name, ...args], { cwd: project });
}
function file(path: string) {
  return readFileSync(join(project, path), "utf8");
}
async function copyProject() {
  mkdirSync(join(root, ".cache"), { recursive: true });
  temporary = mkdtempSync(join(root, ".cache/gen-feature-"));
  project = join(temporary, "project");
  mkdirSync(project);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (
      ["src", "scripts", "messages", "docs", "contract", "e2e", ".claude"].includes(entry.name) ||
      (!entry.isDirectory() &&
        /^(package\.json|.*config\.(ts|mjs|json)|tsconfig.*\.json|next-env\.d\.ts|\.prettierignore)$/.test(
          entry.name,
        )) ||
      [".prettierrc.json", ".gitignore", "pnpm-lock.yaml", "pnpm-workspace.yaml"].includes(
        entry.name,
      )
    ) {
      cpSync(join(root, entry.name), join(project, entry.name), {
        recursive: true,
        filter: (path) =>
          !/(^|[/\\])(node_modules|\.cache|\.env[^/\\]*)([/\\]|$)/.test(relative(root, path)),
      });
    }
  }
  // 잠금 파일의 설치된 버전만 오프라인 재사용한다. 프로젝트 밖 의존성 링크는 만들지 않는다.
  const installed = pnpm(["install", "--offline", "--frozen-lockfile", "--ignore-scripts"], {
    cwd: project,
  });
  expect(installed.status, installed.stdout + installed.stderr).toBe(0);
  copiedTools = await import(pathToFileURL(join(project, "scripts/process.mjs")).href);
  // 이 사본의 CLI가 실행됐는지 결과로 확인한다.
  writeFileSync(
    join(project, "scripts/gen-feature.ts"),
    'console.info("copied-generator-entry");\n' + file("scripts/gen-feature.ts"),
  );
  // 중첩된 임시 경로에서도 Tailwind가 사본의 화면 소스만 검사하게 한다.
  writeFileSync(
    join(project, "src/app/globals.css"),
    file("src/app/globals.css").replace(
      '@import "tailwindcss";',
      '@import "tailwindcss" source("../");',
    ),
  );
}
beforeAll(copyProject, 120000);
afterAll(() => {
  // 이 테스트가 만든 작업 트리 안의 임시 폴더만 지운다.
  if (temporary?.startsWith(join(root, ".cache/gen-feature-")))
    rmSync(temporary, { recursive: true, force: true });
}, 120000);

it("git 없는 독립 사본의 공식 skill과 설치 패키지를 검사한다", async () => {
  const copiedSkills = await import(pathToFileURL(join(project, "scripts/check/skills.ts")).href);
  const copiedFiles = await import(pathToFileURL(join(project, "scripts/check/files.ts")).href);
  expect(copiedSkills.checkOfficialSkills(project, copiedFiles.readProjectFiles(project))).toEqual(
    [],
  );
}, 60000);

describe("골든 기능 생성", () => {
  it("복합 이름으로 기능·공개/보호 화면·번역·HTTP 테스트를 등록하고 고칠 곳을 알린다", () => {
    expect(JSON.parse(file("package.json")).scripts["gen:feature"]).toBe(
      "tsx scripts/gen-feature.ts",
    );
    const result = run("blog-posts");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("copied-generator-entry");
    expect(result.stdout).toContain("고칠 곳");
    expect(result.stdout).toContain("src/features/blog-posts/queries.ts");
    expect(file("src/features/blog-posts/index.ts")).toContain("getBlogPosts");
    expect(file("src/features/blog-posts/my-blog-posts.tsx")).toContain("MyBlogPostList");
    expect(file("src/features/blog-posts/queries.ts")).toContain('GET("/posts"');
    expect(file("src/features/blog-posts/queries.ts")).toContain('Schemas["PostResource"]');
    expect(file("src/features/blog-posts/actions.ts")).toContain('"post.invalid_transition"');
    expect(file("src/features/blog-posts/actions.ts")).toContain('POST("/posts"');
    expect(file("src/features/blog-posts/realtime.tsx")).toContain('useChannel("posts"');
    expect(file("src/app/[locale]/blog-posts/[id]/layout.tsx")).toContain("BlogPostRealtime");
    expect(file("src/app/[locale]/my-blog-posts/[id]/delete/page.tsx")).toContain(
      "deleteBlogPostAction",
    );
    expect(file("scripts/http/blog-posts.integration.test.ts")).toContain("features/blog-posts/");
    expect(file("scripts/http/my-blog-posts.integration.test.ts")).toContain("/my-blog-posts/new");
    expect(file("src/lib/session/redirect.ts")).toContain('"/my-blog-posts"');
    for (const locale of ["ko", "en"]) {
      const catalog = JSON.parse(file(`messages/${locale}.json`));
      expect(catalog.blogPosts.newBlogPost).toBeTruthy();
      expect(catalog.posts.newPost).toBeTruthy();
    }
    expect(file("src/features/blog-posts/AGENTS.md")).toContain("gen:feature");
    expect(file("src/features/blog-posts/CLAUDE.md")).toBe("@AGENTS.md\n");
  });

  it("다른 이름을 이어서 등록하고 복수형 단수형·camel·Pascal·snake·대문자를 한 번만 바꾼다", () => {
    const source = join(project, "src/features/posts/naming.test.ts");
    writeFileSync(
      source,
      `import { expect, it } from "vitest";
const POSTS = "posts";
const POST = "post";
const post_id = POST;
const getPosts = () => POSTS;
// gen:feature: 빼기 시작
const unusedPost = "빼는 예시";
// gen:feature: 빼기 끝
const contractValue = "post.invalid_transition"; // gen:feature: 그대로
const resourceType = "posts"; // gen:feature: 그대로
// gen:feature: 고칠 곳 — 새 기능의 이름을 확인한다.
it("이름", () => {
  expect([getPosts(), post_id, contractValue]).toEqual(["posts", "post", "post.invalid_transition"]);
  expect(resourceType).toBe("posts"); // gen:feature: 그대로
});
`,
    );
    const result = run("categories");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const output = file("src/features/categories/naming.test.ts");
    expect(output).toContain("const CATEGORIES");
    expect(output).toContain("const CATEGORY");
    expect(output).toContain("const category_id");
    expect(output).toContain("const getCategories");
    expect(output).not.toContain("unusedPost");
    expect(output).toContain('const contractValue = "post.invalid_transition"');
    expect(output).toContain('const resourceType = "posts"');
    expect(file("src/lib/session/redirect.ts")).toContain('"/my-blog-posts"');
    expect(file("src/lib/session/redirect.ts")).toContain('"/my-categories"');
    const blog = run("blog-posts");
    expect(blog.status).not.toBe(0);
  });

  it.each(["../escape", "Posts", "post", "a_b", "a--bs", "", "x".repeat(21) + "s"])(
    "잘못된 이름 %s는 파일을 쓰지 않는다",
    (name) => {
      const before = file("messages/ko.json");
      expect(run(name).status).not.toBe(0);
      expect(file("messages/ko.json")).toBe(before);
    },
  );

  it("메시지 또는 화면 이름이 겹쳐도 부분 생성 없이 거절한다", () => {
    const before = file("messages/ko.json");
    expect(run("posts").status).not.toBe(0);
    const catalog = JSON.parse(before);
    catalog.comments = { title: "이미 등록" };
    writeFileSync(join(project, "messages/ko.json"), JSON.stringify(catalog));
    expect(run("comments").status).not.toBe(0);
    expect(existsSync(join(project, "src/features/comments"))).toBe(false);
    mkdirSync(join(project, "src/app/[locale]/albums"));
    expect(run("albums").status).not.toBe(0);
    expect(existsSync(join(project, "src/features/albums"))).toBe(false);
  });

  it("임시 프로젝트와 생성한 기능의 타입·경계 린트·단위/실제 목/HTTP 테스트가 통과한다", () => {
    expect(existsSync(join(project, "src/features/blog-posts/index.ts"))).toBe(true);
    for (const [command, args] of [
      ["next", ["typegen"]],
      ["tsc", ["--noEmit", "--project", "tsconfig.check.json"]],
      [
        "eslint",
        [
          "src/features/blog-posts",
          "src/features/categories",
          "src/app/[locale]/blog-posts",
          "src/app/[locale]/my-blog-posts",
          "src/app/[locale]/categories",
          "src/app/[locale]/my-categories",
          "scripts/http/blog-posts.integration.test.ts",
          "scripts/http/my-blog-posts.integration.test.ts",
        ],
      ],
      [
        "vitest",
        [
          "run",
          "src/features/blog-posts",
          "src/features/categories",
          "scripts/http/blog-posts.integration.test.ts",
          "scripts/http/my-blog-posts.integration.test.ts",
        ],
      ],
    ] as const) {
      const result = copiedTools.binary(command, [...args], { cwd: project });
      expect(result.status, `${command}:\n${result.stdout}\n${result.stderr}`).toBe(0);
      console.info(`생성 사본 ${command}: 성공`);
      if (command === "vitest")
        console.info(result.stdout.match(/Test Files[^\n]*\n\s*Tests[^\n]*/)?.[0]);
    }
  }, 240000);
});
