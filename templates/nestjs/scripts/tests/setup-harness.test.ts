import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareHarness } from "../setup-harness.js";

const state = vi.hoisted(() => ({
  top: "",
  noGit: false,
  installFail: false,
  scannerFail: false,
  events: [] as unknown[],
}));
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(
    (file: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      if (file === "git") {
        if (state.noGit) throw new Error("git 저장소가 없다");
        return state.top + "\n";
      }
      state.events.push([file, args, options.cwd]);
      if (state.installFail) throw new Error("hook 설치 실패");
      return "";
    },
  ),
}));
vi.mock("../tools/betterleaks.js", () => ({
  ensureBetterleaks: (cache: string) => {
    state.events.push(["betterleaks", cache]);
    if (state.scannerFail) return Promise.reject(new Error("체크섬 오류"));
    return Promise.resolve(join(cache, "betterleaks"));
  },
}));
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-setup-harness-"));
  state.top = root;
  state.noGit = false;
  state.installFail = false;
  state.scannerFail = false;
  state.events = [];
  vi.clearAllMocks();
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
it("git 최상위에서만 로컬 lefthook 설치 뒤 비밀 도구를 확인한다", async () => {
  await prepareHarness(root);
  expect(state.events).toEqual([
    [process.execPath, [join(root, "node_modules/lefthook/bin/index.js"), "install"], root],
    ["betterleaks", join(root, ".cache/tools")],
  ]);
  expect(execFileSync).toHaveBeenCalledWith(
    "git",
    ["rev-parse", "--show-toplevel"],
    expect.objectContaining({ cwd: root }),
  );
});
it("상위 저장소 사본은 hook을 바꾸지 않고 비밀 도구만 확인한다", async () => {
  const child = join(root, "app");
  mkdirSync(child);
  await prepareHarness(child);
  expect(state.events).toEqual([["betterleaks", join(child, ".cache/tools")]]);
});
it("git 없는 독립 프로젝트도 비밀 검사 도구를 준비한다", async () => {
  state.noGit = true;
  await prepareHarness(root);
  expect(state.events).toEqual([["betterleaks", join(root, ".cache/tools")]]);
});
it("hook 설치나 체크섬 확인에 실패하면 준비 성공으로 보고하지 않는다", async () => {
  state.installFail = true;
  await expect(prepareHarness(root)).rejects.toThrow("hook 설치 실패");
  state.installFail = false;
  state.scannerFail = true;
  await expect(prepareHarness(root)).rejects.toThrow("체크섬 오류");
});
