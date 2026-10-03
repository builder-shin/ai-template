import { spawnSync } from "node:child_process";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";
import { CreateError } from "./errors.ts";

export type PnpmRunner = (cwd: string, args: string[]) => void;

export const runPnpm: PnpmRunner = (cwd, args) => {
  const entry = process.env.npm_execpath;
  if (!entry) throw new CreateError("pnpm을 찾을 수 없다", "pnpm 12.6.0으로 pnpm new를 실행한다.");
  const javascript = /\.[cm]?js$/.test(entry);
  const result = spawnSync(
    javascript ? process.execPath : entry,
    javascript ? [entry, ...args] : args,
    {
      cwd,
      env: gitEnvironment(),
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error && "code" in result.error && result.error.code === "ENOENT")
    throw new CreateError("pnpm을 찾을 수 없다", "pnpm 12.6.0을 설치하고 pnpm new로 실행한다.");
  if (result.error || result.status !== 0)
    throw new CreateError(
      `pnpm ${args.join(" ")} 실행에 실패했다`,
      result.error
        ? "pnpm 설치·의존성과 생성 입력을 확인한다."
        : (result.stdout + result.stderr).trim() || "pnpm 설치·의존성과 생성 입력을 확인한다.",
    );
};
