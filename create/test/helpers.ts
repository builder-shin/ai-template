import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";

const folders: string[] = [];

export function temporaryFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "aitpl-create-test-"));
  folders.push(folder);
  return folder;
}

export function write(root: string, file: string, content: string): void {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    env: gitEnvironment(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function copyComboAssets(target: string): void {
  const source = resolve(import.meta.dirname, "../..");
  for (const file of git(source, "ls-files", "-z", "--", "create/assets/combo")
    .split("\0")
    .filter(Boolean))
    write(target, file, readFileSync(join(source, file), "utf8"));
}

beforeEach(() => {
  const config = join(temporaryFolder(), "gitconfig");
  writeFileSync(
    config,
    "[user]\n\tname = Fixture\n\temail = fixture@example.com\n[commit]\n\tgpgsign = false\n",
  );
  vi.stubEnv("GIT_CONFIG_GLOBAL", config);
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  vi.stubEnv("GIT_CEILING_DIRECTORIES", tmpdir());
  // 호출한 hook의 신원 덮어쓰기를 빼고 임시 설정의 신원을 쓴다.
  for (const key of Object.keys(process.env)) {
    if (
      /^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$/.test(key) ||
      /^GIT_(AUTHOR|COMMITTER)_/.test(key)
    ) {
      vi.stubEnv(key, undefined);
    }
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

export function fixtureRepository(): string {
  const root = temporaryFolder();
  write(root, "templates/nextjs/README.md", "# Next.js web\n\n내용\n");
  write(
    root,
    "templates/nextjs/package.json",
    '{\n  "name": "nextjs-template",\n  "private": true\n}\n',
  );
  write(root, "templates/nextjs/pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  write(root, "templates/nextjs/template.json", "{}\n");
  write(root, "templates/nextjs/.gitattributes", "* text=auto eol=lf\n");
  write(root, "templates/nextjs/docs/공백 문서.md", "한국어\r\n바이트 보존\r\n");
  write(root, "templates/nextjs/bin/start.sh", "#!/bin/sh\necho ok\n");
  write(root, "templates/fastapi/README.md", "# FastAPI 템플릿\n\n내용\n");
  write(
    root,
    "templates/fastapi/compose.yaml",
    "# 개발 인프라\nx-app: &app\n  image: fastapi-template-app # 이미지\nservices:\n  api:\n    <<: *app\n  postgres:\n    image: postgres:18\n",
  );
  write(root, "templates/fastapi/pyproject.toml", '[project]\nname = "app"\n');
  write(root, "templates/fastapi/uv.lock", "version = 1\n");
  write(root, "templates/fastapi/template.json", "{}\n");
  // POSIX에서는 작업 파일도 인덱스와 같은 실행 권한을 갖게 한다.
  if (process.platform !== "win32") chmodSync(join(root, "templates/nextjs/bin/start.sh"), 0o755);
  git(root, "init", "-b", "main");
  git(root, "add", "--", "templates");
  git(root, "update-index", "--chmod=+x", "templates/nextjs/bin/start.sh");
  git(root, "-c", "commit.gpgsign=false", "commit", "-m", "chore: fixture");
  write(root, "templates/nextjs/untracked.txt", "복사하지 않는다\n");
  return root;
}
