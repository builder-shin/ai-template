import * as fs from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createProject } from "../src/create.ts";
import { fixtureRepository, git, temporaryFolder, write } from "./helpers.ts";

vi.mock("node:fs", async (original) => {
  const actual = await original<typeof fs>();
  return {
    ...actual,
    rmSync: vi.fn(actual.rmSync),
    renameSync: vi.fn(actual.renameSync),
    mkdtempSync: vi.fn(actual.mkdtempSync),
  };
});

const actual = await vi.importActual<typeof fs>("node:fs");
afterEach(() => {
  vi.mocked(fs.rmSync).mockReset().mockImplementation(actual.rmSync);
  vi.mocked(fs.renameSync).mockReset().mockImplementation(actual.renameSync);
  vi.mocked(fs.mkdtempSync).mockReset().mockImplementation(actual.mkdtempSync);
  vi.restoreAllMocks();
});

const request = (target: string) => ({
  target,
  name: "my-project",
  template: "nextjs" as const,
  git: false,
});

it.skipIf(process.platform !== "win32")("쓰기 권한 오류는 이동 잠금 안내로 바꾸지 않는다", () => {
  const root = fixtureRepository();
  const target = join(temporaryFolder(), "aitpl-app");
  const failure = Object.assign(new Error("denied"), { code: "EPERM" });
  vi.mocked(fs.mkdtempSync).mockImplementationOnce(() => {
    throw failure;
  });
  expect(() => createProject(request(target), root)).toThrow(failure);
});

it("사용 중인 빈 대상 폴더를 유지하고 그 안에 생성한다", async () => {
  const root = fixtureRepository();
  const target = temporaryFolder();
  const before = fs.statSync(target);
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    cwd: target,
    stdio: "ignore",
  });
  await once(child, "spawn");
  try {
    createProject(request(target), root);
    expect(fs.statSync(target).ino).toBe(before.ino);
    expect(fs.statSync(target).mode).toBe(before.mode);
    expect(fs.existsSync(join(target, "package.json"))).toBe(true);
  } finally {
    child.kill();
    await once(child, "exit");
  }
});

it.skipIf(process.platform === "win32")("새 대상은 기본 폴더 권한으로 만든다", () => {
  const root = fixtureRepository();
  const target = join(temporaryFolder(), "aitpl-app");
  createProject(request(target), root);
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- mkdir 기본 권한과 비교한다.
  expect(fs.statSync(target).mode & 0o777).toBe(0o777 & ~process.umask());
});

it("뒤 단계가 실패하면 새로 만든 상위 폴더도 정리한다", () => {
  const root = fixtureRepository();
  write(root, "templates/nextjs/package.json", "invalid json\n");
  git(root, "add", "templates");
  git(root, "-c", "commit.gpgsign=false", "commit", "-m", "chore: invalid fixture");
  const parent = temporaryFolder();
  expect(() => createProject(request(join(parent, "missing/nested/aitpl-app")), root)).toThrow(
    SyntaxError,
  );
  expect(fs.readdirSync(parent)).toEqual([]);
});

it("정리가 실패해도 원래 오류와 남은 경로를 보존하고 재시도를 지정한다", () => {
  const root = fixtureRepository();
  write(root, "templates/nextjs/package.json", "invalid json\n");
  git(root, "add", "templates");
  git(root, "-c", "commit.gpgsign=false", "commit", "-m", "chore: invalid fixture");
  const parent = temporaryFolder();
  const cleanup = vi.mocked(fs.rmSync);
  const messages = vi.spyOn(console, "error").mockImplementation(() => undefined);
  cleanup.mockImplementationOnce(() => {
    throw Object.assign(new Error("locked"), { code: "EBUSY" });
  });
  try {
    expect(() => createProject(request(join(parent, "aitpl-app")), root)).toThrow(SyntaxError);
    expect(cleanup).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxRetries: 5, retryDelay: 100 }),
    );
    expect(messages.mock.calls.flat().join("\n")).toMatch(/SyntaxError.* — .*aitpl-my-project-/);
  } finally {
    cleanup.mockImplementation(actual.rmSync);
  }
});

it.skipIf(process.platform !== "win32")("잠긴 대상 오류는 프로그램을 닫도록 안내한다", () => {
  const root = fixtureRepository();
  const target = join(temporaryFolder(), "aitpl-app");
  vi.mocked(fs.renameSync).mockImplementationOnce(() => {
    throw Object.assign(new Error("busy"), { code: "EBUSY", path: target });
  });
  expect(() => createProject(request(target), root)).toThrow(
    /^pnpm new: .*EBUSY.* — .*프로그램.*닫/,
  );
});
