import { writeSync } from "node:fs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_SERVER } from "next/constants";
import { parseEnv } from "./src/lib/env";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_SERVER) {
    try {
      parseEnv(process.env);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      // 종료 전에 변수별 안내만 쓰고 값이나 스택은 출력하지 않는다.
      writeSync(2, `${error.message}\n`);
      process.exit(1);
    }
  }
  return withNextIntl({
    agentRules: false,
    turbopack: { root: import.meta.dirname },
  });
}
