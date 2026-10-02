import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_SERVER } from "next/constants";
import { exitOnInvalidEnv } from "./src/lib/env/startup";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_SERVER) {
    exitOnInvalidEnv(process.env);
  }
  return withNextIntl({
    agentRules: false,
    output: "standalone",
    turbopack: { root: import.meta.dirname },
  });
}
