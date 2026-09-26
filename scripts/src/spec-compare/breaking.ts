import { spawnSync } from "node:child_process";
import { ensureTool } from "../tools/install.ts";
import { TOOLS } from "../tools/manifest.ts";

export interface BreakingResult {
  readonly ok: boolean;
  readonly output: string;
}

/** 구현 스펙이 계약을 쓰는 클라이언트를 깨뜨리는지 oasdiff로 검사한다. */
export async function checkBreaking(
  contractPath: string,
  implementationPath: string,
  cacheDir: string,
): Promise<BreakingResult> {
  const oasdiff = await ensureTool(TOOLS.oasdiff, cacheDir);
  const args = ["breaking", contractPath, implementationPath, "--fail-on", "ERR"];
  const result = spawnSync(oasdiff, [...args, "--format", "singleline", "--color", "never"], {
    encoding: "utf8",
  });
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}`.trim() };
}
