import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const secret = 'password = "Rv8Dm2qZ5nK7sX4jP9cL6wT3bH1fY0aG"'; // betterleaks:allow 사유: 임시 파일에 쓰는 탐지 회귀 샘플

it.each([
  [".betterleaks.toml", "templates/nextjs/pnpm-lock.yaml", true],
  ["templates/nextjs/.betterleaks.toml", "pnpm-lock.yaml", false],
])(
  "%s의 잠금 파일 정책과 수기 소스 탐지를 확인한다",
  (config, lockfile, scanLockfile) => {
    const entry = process.env.npm_execpath;
    if (!entry) throw new Error("pnpm으로 테스트를 실행한다.");
    for (const [path, content, status] of [
      [lockfile, "      '@inquirer/password': 5.2.2(@types/node@24.13.6)", 0],
      // 독립 템플릿은 기본 prefilter로 잠금 파일을 제외한다. 저장소는 중첩 잠금 파일을 검사한다.
      [lockfile, secret, scanLockfile ? 1 : 0],
      ["src/probe.ts", `${secret}; // @inquirer/password`, 1],
    ] as const) {
      const root = mkdtempSync(join(tmpdir(), "betterleaks-allowlist-"));
      try {
        const fixture = join(root, path);
        mkdirSync(dirname(fixture), { recursive: true });
        writeFileSync(fixture, content);
        const args = [
          "tool",
          "betterleaks",
          "stdin",
          "--set-attr",
          `path=${path}`,
          "--config",
          join(repository, config),
          "--no-banner",
          "--redact",
        ];
        const javascript = /\.[cm]?js$/.test(entry);
        const result = spawnSync(
          javascript ? process.execPath : entry,
          javascript ? [entry, ...args] : args,
          {
            cwd: repository,
            input: readFileSync(fixture, "utf8"),
            encoding: "utf8",
            windowsHide: true,
            timeout: 30000,
          },
        );
        expect(result.error).toBeUndefined();
        expect(result.status, `${path}\n${result.stdout}${result.stderr}`).toBe(status);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  },
  120000,
);
