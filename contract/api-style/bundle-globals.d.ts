import type { RawUniversalConfig } from "@redocly/openapi-core";

declare global {
  /** build.js가 esbuild define으로 넣는 redocly.yaml의 rules. bundle.js에서만 쓴다. */
  const API_STYLE_RULES: NonNullable<RawUniversalConfig["rules"]>;
}
