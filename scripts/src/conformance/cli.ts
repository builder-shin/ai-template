import { spawnSync } from "node:child_process";
import { composeArgs, TARGETS, testEnv } from "./targets.ts";

/**
 * 사용법: pnpm conformance <대상> [--keep]
 * 대상 스택을 docker compose로 띄우고, 적합성 흐름 테스트를 돌린 뒤 내린다. --keep이면 스택을 둔다.
 */
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const name = args.find((arg) => !arg.startsWith("--")) ?? "";
const target = TARGETS[name];
if (target === undefined) {
  console.error(`사용법: pnpm conformance <${Object.keys(TARGETS).join("|")}> [--keep]`);
  process.exit(2);
}

/**
 * 명령을 쉘로 실행한다. Windows에서 pnpm은 .cmd라 쉘을 거쳐야 한다.
 * 인자 배열을 shell: true와 함께 넘기면 Node가 경고(DEP0190)하므로 한 줄로 이어 붙인다. 인자에는 공백이 없다.
 */
function run(command: readonly string[], env: Record<string, string> = {}) {
  const result = spawnSync(command.join(" "), {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  return result.status ?? 1;
}

let status = run(["docker", ...composeArgs(target, "up")]);
if (status !== 0) {
  console.error(`${target.name} 스택을 띄우지 못했다. docker compose 출력을 확인한다.`);
} else {
  status = run(
    ["pnpm", "--filter", "@ai-template/conformance", "run", "test:flows"],
    testEnv(target),
  );
}
if (!keep) run(["docker", ...composeArgs(target, "down")]);
process.exitCode = status;
