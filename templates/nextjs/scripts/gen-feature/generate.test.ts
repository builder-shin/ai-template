import { afterEach, beforeEach, expect, it } from "vitest";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { generateFeature } from "./generate";
import { GenerateError } from "./names";

const temporaryRoot = tmpdir();
let temporary: string;
let project: string;

function write(path: string, content: string | Buffer) {
  const target = join(project, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

beforeEach(() => {
  temporary = mkdtempSync(join(temporaryRoot, "aitpl-gen-feature-inputs-"));
  project = join(temporary, "project");
  for (const path of [
    "src/features/posts/index.ts",
    "src/app/[locale]/posts/page.tsx",
    "src/app/[locale]/my-posts/page.tsx",
    "scripts/http/posts.integration.test.ts",
    "scripts/http/my-posts.integration.test.ts",
  ])
    write(path, "export const posts = true;\n");
  for (const locale of ["ko", "en"])
    write(`messages/${locale}.json`, JSON.stringify({ posts: { title: "글" } }));
  write(
    "src/lib/session/routes.ts",
    'export const isProtectedPath = (path: string) => ["/my-posts"].some((value) => path.startsWith(value));\n',
  );
  write("package.json", "{}\n");
  write(".prettierrc.json", "{}\n");
});

afterEach(() => {
  // 이 테스트가 만든 OS 임시 폴더 바로 아래의 트리만 지운다.
  if (
    dirname(temporary) === temporaryRoot &&
    basename(temporary).startsWith("aitpl-gen-feature-inputs-")
  )
    rmSync(temporary, { recursive: true, force: true });
});

function snapshot(directory = temporary): Record<string, string> {
  return Object.fromEntries(
    readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      const key = relative(temporary, path);
      const entry = lstatSync(path);
      if (entry.isSymbolicLink()) return [[key, `link:${readlinkSync(path)}`]];
      if (entry.isDirectory()) return [[key, "directory"], ...Object.entries(snapshot(path))];
      return [[key, readFileSync(path).toString("hex")]];
    }),
  );
}

async function rejectWithoutWriting(...paths: string[]) {
  const before = snapshot();
  const error: unknown = await generateFeature(project, "comments").then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(error).toBeInstanceOf(GenerateError);
  if (error instanceof GenerateError)
    for (const path of paths) expect(error.message).toContain(path);
  expect(snapshot()).toEqual(before);
}

function linkUnavailable(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    ["EPERM", "EACCES", "ENOTSUP", "ENOSYS"].includes(String(error.code))
  );
}

it.for([
  "src/features/posts",
  "src/app/[locale]/posts",
  "src/app/[locale]/my-posts",
  "scripts/http",
])("링크 입력 %s를 거절하고 원본과 출력 트리를 그대로 둔다", async (path, context) => {
  const source = resolve(project, path);
  const target = join(temporary, "linked-source");
  // 이동할 두 절대 경로가 이 픽스처 안에 있는지 먼저 확인한다.
  expect(relative(temporary, source).startsWith("..")).toBe(false);
  expect(dirname(target)).toBe(temporary);
  renameSync(source, target);
  const failures: string[] = [];
  const kinds = process.platform === "win32" ? (["junction", "dir"] as const) : (["dir"] as const);
  for (const kind of kinds) {
    try {
      symlinkSync(target, source, kind);
      break;
    } catch (error) {
      if (!linkUnavailable(error)) throw error;
      failures.push(`${kind}: ${String(error)}`);
    }
  }
  if (!lstatSync(source, { throwIfNoEntry: false })) {
    context.skip(`symlink와 junction을 만들 수 없다: ${failures.join("; ")}`);
    return;
  }
  await rejectWithoutWriting(path);
});

it.for(["posts", "my-posts"])(
  "HTTP 원본 %s 파일 링크를 쓰기 전에 거절한다",
  async (name, context) => {
    const path = `scripts/http/${name}.integration.test.ts`;
    const source = join(project, path);
    const target = join(temporary, "linked-source.ts");
    expect(relative(temporary, source).startsWith("..")).toBe(false);
    expect(dirname(target)).toBe(temporary);
    renameSync(source, target);
    try {
      symlinkSync(target, source, "file");
    } catch (error) {
      if (!linkUnavailable(error)) throw error;
      context.skip(
        `파일 symlink 권한이 없다; HTTP 디렉터리 junction은 별도로 검사한다: ${String(error)}`,
      );
      return;
    }
    await rejectWithoutWriting(path);
  },
);

it.each([
  ["NUL", Buffer.from("# posts\0\n")],
  ["잘못된 UTF-8", Buffer.from([0xc3, 0x28])],
  ["제어", Buffer.from([0x01])],
])("Markdown의 %s 바이트를 거절하고 어떤 파일도 쓰지 않는다", async (_kind, bytes) => {
  const path = "src/features/posts/payload.md";
  write(path, bytes);
  await rejectWithoutWriting(path);
});

it("이름 변환의 출력 충돌에 두 원본 경로를 알리고 어떤 파일도 쓰지 않는다", async () => {
  const first = "src/features/posts/comment.ts";
  const second = "src/features/posts/post.ts";
  write(first, "export const first = true;\n");
  write(second, "export const second = true;\n");
  await rejectWithoutWriting(first, second);
});

it("대소문자만 다른 출력 충돌에도 두 원본 경로를 알리고 어떤 파일도 쓰지 않는다", async () => {
  const first = "src/features/posts/Comment.ts";
  const second = "src/features/posts/post.ts";
  write(first, "export const first = true;\n");
  write(second, "export const second = true;\n");
  await rejectWithoutWriting(first, second);
});

it.each(["ko", "en"])("%s 공유 namespace와 겹치면 어떤 파일도 쓰지 않는다", async (locale) => {
  const path = `messages/shared/${locale}.json`;
  write(path, JSON.stringify({ comments: { title: "댓글" } }));
  await rejectWithoutWriting(`${path}: comments 키가 이미 있다 — 다른 이름을 쓴다.`);
});
