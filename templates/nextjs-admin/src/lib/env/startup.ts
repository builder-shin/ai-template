import { writeSync } from "node:fs";
import { parseEnv } from "../env";

export function exitOnInvalidEnv(env: Record<string, string | undefined>) {
  try {
    parseEnv(env);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    // 종료 전에 변수별 안내만 쓰고 값이나 스택은 출력하지 않는다.
    writeSync(2, `${error.message}\n`);
    process.exit(1);
  }
}
