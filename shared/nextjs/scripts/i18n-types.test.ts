import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { binary } from "./process.mjs";

it("ko에서 파생한 타입은 정상 키만 허용하고 없는 키는 컴파일 오류다", () => {
  mkdirSync(".cache", { recursive: true });
  const directory = mkdtempSync(".cache/i18n-types-");
  const file = join(directory, "probe.ts");
  const compile = (key: string) => {
    writeFileSync(
      file,
      `import { useTranslations } from "next-intl";\nfunction Probe() { return useTranslations("errorPage")(${JSON.stringify(key)}); }\n`,
    );
    return binary(
      "tsc",
      [
        "--ignoreConfig",
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--module",
        "esnext",
        "--moduleResolution",
        "bundler",
        "--resolveJsonModule",
        "--esModuleInterop",
        "--target",
        "ES2022",
        file,
        "src/lib/i18n/types.d.ts",
      ],
      { timeout: 15000 },
    );
  };
  try {
    const valid = compile("title");
    expect(valid.status, valid.stdout + valid.stderr).toBe(0);
    const missing = compile("missing_key");
    expect(missing.status).toBe(2);
    expect(missing.stdout).toContain("Argument of type '\"missing_key\"'");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
