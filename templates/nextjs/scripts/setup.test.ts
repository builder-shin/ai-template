import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it.each([0, 23])("setup은 환경과 hook을 준비한 뒤 Chromium을 설치한다: %s", (browserStatus) => {
  const root = mkdtempSync(join(tmpdir(), "next-setup-"));
  const scripts = join(root, "scripts");
  // 실제 파일 병합은 유지하고 네트워크 설치 경계만 대체한다. 환경 내용은 출력하지 않는다.
  spawnSync(process.execPath, ["-e", "require('node:fs').mkdirSync(process.argv[1])", scripts]);
  for (const file of ["setup.mjs", "envfile.mjs"])
    copyFileSync(new URL(file, import.meta.url), join(scripts, file));
  writeFileSync(join(root, ".env.example"), "FIXTURE_KEY=fixture\n");
  writeFileSync(
    join(scripts, "process.mjs"),
    `
    import { appendFileSync, existsSync } from "node:fs";
    export function pnpm(args) {
      appendFileSync("events.jsonl", JSON.stringify({ args, prepared: existsSync(".env") }) + "\\n");
      return { status: args.includes("playwright") ? ${browserStatus} : 0 };
    }
  `,
  );
  try {
    expect(spawnSync("git", ["init", "--quiet", root]).status).toBe(0);
    const run = () =>
      spawnSync(process.execPath, [join(scripts, "setup.mjs")], {
        encoding: "utf8",
        windowsHide: true,
      });
    const first = run();
    expect(first.status).toBe(browserStatus);
    expect(existsSync(join(root, ".env"))).toBe(true);
    const events = readFileSync(join(root, "events.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events).toEqual([
      { args: ["install", "--frozen-lockfile"], prepared: false },
      { args: ["exec", "lefthook", "install"], prepared: true },
      { args: ["exec", "playwright", "install", "chromium"], prepared: true },
    ]);
    const modified = statSync(join(root, ".env")).mtimeMs;
    expect(run().status).toBe(browserStatus);
    expect(statSync(join(root, ".env")).mtimeMs).toBe(modified);
    expect(first.stdout + first.stderr).not.toContain("fixture");
    if (browserStatus) expect(first.stderr).toContain("Chromium");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
