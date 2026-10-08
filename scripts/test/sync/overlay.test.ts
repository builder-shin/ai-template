import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitEnvironment } from "../../src/files/git-environment.ts";
import { syncSharedAssets } from "../../src/sync/sync.ts";
import { listFiles } from "../../src/verify-templates/files.ts";
import {
  readSharedAssets,
  type SharedAssetTarget,
  type SharedAssetsManifest,
} from "../../src/verify-templates/manifest.ts";
import { verifyTemplate } from "../../src/verify-templates/verify.ts";

const repos: string[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
});

function write(repo: string, path: string, content: string): void {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
}

const read = (repo: string, path: string) => readFileSync(join(repo, path), "utf8");
const raw = (repo: string) =>
  JSON.parse(read(repo, "scripts/shared-assets.json")) as SharedAssetsManifest;
const target = (template = "web", path = ".") => ({ template, path });
const overlay = (targets: readonly SharedAssetTarget[] = [target()]) => ({
  source: "shared/nextjs",
  mode: "overlay",
  targets,
});

function save(repo: string, assets: unknown[]): void {
  write(repo, "scripts/shared-assets.json", `${JSON.stringify({ assets }, null, 2)}\n`);
}

function load(repo: string): SharedAssetsManifest {
  const result = readSharedAssets(repo);
  expect(result).not.toBeInstanceOf(Array);
  if (Array.isArray(result)) throw new Error(result.join("\n"));
  return result;
}

function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "aitpl-overlay-"));
  repos.push(repo);
  write(repo, "shared/nextjs/src/lib/cookie.ts", "// 공통 쿠키\n");
  write(repo, "shared/nextjs/.claude/hooks/check.mjs", "// 공통 검사\n");
  write(repo, "shared/nextjs/.cache/example.txt", "캐시도 원본 파일\n");
  write(repo, "shared/nextjs/node_modules/pkg/index.js", "복사하지 않음\n");
  write(repo, "shared/nextjs/src/node_modules/pkg/index.js", "복사하지 않음\n");
  write(repo, "templates/web/src/app/page.tsx", "// 앱 화면\n");
  write(repo, "templates/web/src/lib/local.ts", "// 앱 파일\n");
  write(repo, "templates/web/src/node_modules/local/index.js", "기존 설치물\n");
  write(
    repo,
    "templates/web/template.json",
    JSON.stringify({
      name: "web",
      kind: "frontend",
      runner: "pnpm",
      goldenModule: "src/features/posts",
    }),
  );
  write(repo, "templates/web/AGENTS.md", "# web\n");
  write(repo, "templates/web/CLAUDE.md", "@AGENTS.md\n");
  write(
    repo,
    "templates/web/package.json",
    JSON.stringify({
      scripts: Object.fromEntries(
        ["setup", "dev", "check", "fix", "test", "test:e2e", "gen"].map((name) => [name, "echo"]),
      ),
    }),
  );
  write(
    repo,
    "templates/web/.claude/settings.json",
    JSON.stringify({
      hooks: Object.fromEntries(
        ["PostToolUse", "Stop", "PreToolUse", "SessionStart"].map((event) => [
          event,
          [{ hooks: [{ type: "command", command: "node", args: [".claude/hooks/check.mjs"] }] }],
        ]),
      ),
    }),
  );
  write(repo, "templates/web/.env.example", "API_BASE_URL=\n");
  write(repo, "templates/web/.gitattributes", "* text=auto eol=lf\n");
  write(repo, "templates/web/.github/workflows/ci.yml", "name: ci\n");
  write(repo, "templates/web/docs/recipes/add-feature.md", "# 기능 추가\n");
  write(repo, "templates/web/src/features/posts/index.ts", "export {};\n");
  save(repo, [overlay()]);
  execFileSync("git", ["init", "--quiet"], { cwd: repo, env: gitEnvironment() });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: repo, env: gitEnvironment() });
  execFileSync("git", ["config", "core.ignorecase", "false"], { cwd: repo, env: gitEnvironment() });
  track(repo);
  return repo;
}

function track(repo: string): void {
  execFileSync("git", ["add", "--all", "--", "shared/nextjs"], {
    cwd: repo,
    env: gitEnvironment(),
  });
}

describe("공유 자산 덮어 놓기", () => {
  it("새 대상은 다른 대상의 기록 경로에서 앱 파일을 덮지 않는다", () => {
    const repo = makeRepo();
    syncSharedAssets(repo, load(repo));
    const asset = load(repo).assets[0];
    if (!asset) throw new Error("원본 항목이 없다");
    write(repo, "shared/nextjs/src/lib/cookie.ts", "// 새 원본\n");
    write(repo, "templates/admin/src/lib/cookie.ts", "// 관리자 앱 파일\n");
    save(repo, [{ ...asset, targets: [...asset.targets, target("admin")] }]);
    expect(() => syncSharedAssets(repo, raw(repo))).toThrow(/앱 파일 자리/);
    expect(read(repo, "templates/admin/src/lib/cookie.ts")).toBe("// 관리자 앱 파일\n");
    expect(read(repo, "templates/web/src/lib/cookie.ts")).toBe("// 공통 쿠키\n");
    write(repo, "templates/admin/src/lib/cookie.ts", "// 새 원본\n");
    syncSharedAssets(repo, load(repo));
    write(repo, "shared/nextjs/src/lib/cookie.ts", "// 다음 원본\n");
    syncSharedAssets(repo, load(repo));
    expect(read(repo, "templates/admin/src/lib/cookie.ts")).toBe("// 다음 원본\n");
  });

  it("새 대상은 지운 원본의 기록 경로에서 앱 파일을 계속 보존한다", () => {
    const repo = makeRepo();
    syncSharedAssets(repo, load(repo));
    rmSync(join(repo, "shared/nextjs/src/lib/cookie.ts"));
    const asset = load(repo).assets[0];
    if (!asset) throw new Error("원본 항목이 없다");
    for (const file of [
      "template.json",
      "AGENTS.md",
      "CLAUDE.md",
      "package.json",
      ".claude/settings.json",
      ".env.example",
      ".gitattributes",
      ".github/workflows/ci.yml",
      "docs/recipes/add-feature.md",
      "src/features/posts/index.ts",
    ])
      write(repo, `templates/admin/${file}`, read(repo, `templates/web/${file}`));
    write(repo, "templates/admin/src/lib/cookie.ts", "// 관리자 앱 파일\n");
    save(repo, [{ ...asset, targets: [...asset.targets, target("admin")] }]);
    syncSharedAssets(repo, load(repo));
    syncSharedAssets(repo, load(repo));
    expect(read(repo, "templates/admin/src/lib/cookie.ts")).toBe("// 관리자 앱 파일\n");
    expect(verifyTemplate(repo, "admin", load(repo))).toEqual([]);
    expect(existsSync(join(repo, "templates/web/src/lib/cookie.ts"))).toBe(false);
    write(repo, "shared/nextjs/src/lib/cookie.ts", "// 다시 공유할 원본\n");
    expect(() => syncSharedAssets(repo, raw(repo))).toThrow(/앱 파일 자리/);
  });

  it("항목 기록만 있는 이전 형식도 새 대상의 앱 파일을 덮지 않는다", () => {
    const repo = makeRepo();
    write(repo, "templates/admin/src/lib/cookie.ts", "// 관리자 앱 파일\n");
    save(repo, [{ ...overlay([target(), target("admin")]), managedFiles: ["src/lib/cookie.ts"] }]);
    expect(() => syncSharedAssets(repo, raw(repo))).toThrow(/앱 파일 자리/);
    expect(existsSync(join(repo, "templates/web/src/lib/cookie.ts"))).toBe(false);
  });

  it("지운 사본마다 경로 한 줄을 출력하고 삭제 없는 실행은 기존 줄 수다", () => {
    const repo = makeRepo();
    save(repo, [overlay([target(), target("admin", "base")])]);
    expect(syncSharedAssets(repo, load(repo))).toHaveLength(2);
    rmSync(join(repo, "shared/nextjs/src/lib/cookie.ts"));
    const lines = syncSharedAssets(repo, load(repo));
    expect(lines.filter((line) => line.includes("삭제"))).toEqual([
      "templates/web/src/lib/cookie.ts: 사본 삭제",
      "templates/admin/base/src/lib/cookie.ts: 사본 삭제",
    ]);
    expect(lines).toHaveLength(4);
    expect(syncSharedAssets(repo, load(repo))).toHaveLength(2);
  });

  it("미추적 편집기·OS 파일은 복사하거나 기록하지 않고 스테이징한 파일만 더한다", () => {
    const repo = makeRepo();
    for (const file of [".DS_Store", "src/lib/cookie.ts~", "src/lib/new.ts"])
      write(repo, `shared/nextjs/${file}`, "// 미추적\n");
    syncSharedAssets(repo, load(repo));
    for (const file of [".DS_Store", "src/lib/cookie.ts~", "src/lib/new.ts"]) {
      expect(existsSync(join(repo, "templates/web", file))).toBe(false);
      expect(load(repo).assets[0]?.managedFiles).not.toContain(file);
    }
    execFileSync("git", ["add", "--", "shared/nextjs/src/lib/new.ts"], {
      cwd: repo,
      env: gitEnvironment(),
    });
    syncSharedAssets(repo, load(repo));
    expect(read(repo, "templates/web/src/lib/new.ts")).toBe("// 미추적\n");
    expect(load(repo).assets[0]?.managedFiles).toContain("src/lib/new.ts");
  });

  it("기록에 없는 새 원본은 다른 내용의 앱 파일을 덮지 않는다", () => {
    const repo = makeRepo();
    syncSharedAssets(repo, load(repo));
    write(repo, "shared/nextjs/src/lib/local.ts", "// 공통 판\n");
    track(repo);
    expect(readSharedAssets(repo)).toEqual([
      "templates/web/src/lib/local.ts: 앱 파일 자리에 새 원본(shared/nextjs/src/lib/local.ts)을 쓸 수 없다 — 앱 파일을 옮기거나 원본과 같은 내용으로 맞춘 뒤 pnpm sync한다.",
    ]);
    expect(() => syncSharedAssets(repo, raw(repo))).toThrow(/앱 파일 자리/);
    expect(read(repo, "templates/web/src/lib/local.ts")).toBe("// 앱 파일\n");
    write(repo, "shared/nextjs/src/lib/local.ts", "// 앱 파일\n");
    syncSharedAssets(repo, load(repo));
    expect(load(repo).assets[0]?.managedFiles).toContain("src/lib/local.ts");
  });

  it("지운 원본의 사본은 기록에서 빼면 앱 파일로 남는다", () => {
    const repo = makeRepo();
    syncSharedAssets(repo, load(repo));
    rmSync(join(repo, "shared/nextjs/src/lib/cookie.ts"));
    expect(verifyTemplate(repo, "web", load(repo))).toEqual([
      "src/lib/cookie.ts: 지운 원본(shared/nextjs/src/lib/cookie.ts)의 사본이 남았다 — 앱 파일로 두려면 managedFiles에서 이 경로를 빼고, 아니면 pnpm sync로 지운다.",
    ]);
    const [asset] = load(repo).assets;
    if (asset?.managedFiles === undefined) throw new Error("managedFiles 기록이 없다");
    save(repo, [
      { ...asset, managedFiles: asset.managedFiles.filter((f) => f !== "src/lib/cookie.ts") },
    ]);
    expect(verifyTemplate(repo, "web", load(repo))).toEqual([]);
    syncSharedAssets(repo, load(repo));
    expect(read(repo, "templates/web/src/lib/cookie.ts")).toBe("// 공통 쿠키\n");
  });

  it("대소문자만 다른 원본·기록 경로는 동기화 전에 거절한다", () => {
    const repo = makeRepo();
    syncSharedAssets(repo, load(repo));
    rmSync(join(repo, "shared/nextjs/src/lib/cookie.ts"));
    write(repo, "shared/nextjs/src/lib/Cookie.ts", "// 공통 쿠키\n");
    track(repo);
    expect(readSharedAssets(repo)).toEqual([
      "assets[0].managedFiles: 대소문자만 다른 경로가 있다(src/lib/Cookie.ts, src/lib/cookie.ts) — 옛 경로의 사본을 지우고 managedFiles에서 뺀 뒤 pnpm sync한다.",
    ]);
    expect(() => syncSharedAssets(repo, raw(repo))).toThrow(/대소문자/);
    expect(read(repo, "templates/web/src/lib/cookie.ts")).toBe("// 공통 쿠키\n");
  });

  it("CLI를 다시 실행해도 기록과 사본이 안정적이고 사본 검사 CLI가 드리프트를 막는다", () => {
    const repo = makeRepo();
    const syncCli = resolve(import.meta.dirname, "../../src/sync/cli.ts");
    const checkCli = resolve(import.meta.dirname, "../../src/verify-templates/cli.ts");
    const args = (cli: string) => ["--import", import.meta.resolve("tsx"), cli];
    const sync = () =>
      execFileSync(process.execPath, args(syncCli), { cwd: repo, encoding: "utf8" });
    expect(sync()).toContain("shared/nextjs → templates/web/.");
    const before = read(repo, "scripts/shared-assets.json");
    sync();
    expect(read(repo, "scripts/shared-assets.json")).toBe(before);
    const checked = spawnSync(process.execPath, args(checkCli), { cwd: repo, encoding: "utf8" });
    expect(checked.status).toBe(0);
    write(repo, "templates/web/src/lib/cookie.ts", "// 낡은 사본\n");
    const drift = spawnSync(process.execPath, args(checkCli), { cwd: repo, encoding: "utf8" });
    expect(drift.status).toBe(1);
    expect(drift.stderr).toContain("shared/nextjs/src/lib/cookie.ts");
    expect(drift.stderr).toContain("고친 뒤 pnpm sync");
    rmSync(join(repo, "shared/nextjs/src/lib/cookie.ts"));
    sync();
    expect(existsSync(join(repo, "templates/web/src/lib/cookie.ts"))).toBe(false);
    expect(read(repo, "templates/web/src/app/page.tsx")).toBe("// 앱 화면\n");
  });

  it("루트와 하위 폴더에 원본만 덮고 앱 파일과 설치물은 그대로 둔다", () => {
    const repo = makeRepo();
    save(repo, [overlay([target(), target("admin", "base")])]);
    syncSharedAssets(repo, load(repo));
    for (const base of ["templates/web", "templates/admin/base"]) {
      expect(read(repo, `${base}/src/lib/cookie.ts`)).toBe("// 공통 쿠키\n");
      expect(read(repo, `${base}/.claude/hooks/check.mjs`)).toBe("// 공통 검사\n");
      expect(read(repo, `${base}/.cache/example.txt`)).toBe("캐시도 원본 파일\n");
      expect(existsSync(join(repo, base, "node_modules"))).toBe(false);
      expect(existsSync(join(repo, base, "src/node_modules/pkg"))).toBe(false);
    }
    expect(read(repo, "templates/web/src/app/page.tsx")).toBe("// 앱 화면\n");
    expect(read(repo, "templates/web/src/lib/local.ts")).toBe("// 앱 파일\n");
    expect(read(repo, "templates/web/src/node_modules/local/index.js")).toBe("기존 설치물\n");
    write(repo, "shared/nextjs/src/lib/cookie.ts", "// 바뀐 쿠키\n");
    syncSharedAssets(repo, load(repo));
    expect(read(repo, "templates/web/src/lib/cookie.ts")).toBe("// 바뀐 쿠키\n");
  });

  it("다시 읽은 manifest로 삭제 파일을 모든 대상에서 지우고 기록은 저장소에만 둔다", () => {
    const repo = makeRepo();
    save(repo, [overlay([target(), target("admin")])]);
    syncSharedAssets(repo, load(repo));
    const first = read(repo, "scripts/shared-assets.json");
    expect(first).toContain('"src/lib/cookie.ts"');
    rmSync(join(repo, "shared/nextjs/src/lib/cookie.ts"));
    syncSharedAssets(repo, load(repo));
    expect(read(repo, "scripts/shared-assets.json")).toBe(first);
    for (const template of ["web", "admin"]) {
      expect(existsSync(join(repo, "templates", template, "src/lib/cookie.ts"))).toBe(false);
      expect(
        listFiles(join(repo, "templates", template)).some((file) => file.includes("shared-assets")),
      ).toBe(false);
    }
    expect(read(repo, "templates/web/src/lib/local.ts")).toBe("// 앱 파일\n");
    // 이전 사본이 다시 생겨도 삭제 기록은 남아 있다.
    write(repo, "templates/web/src/lib/cookie.ts", "// 낡은 사본\n");
    syncSharedAssets(repo, load(repo));
    expect(existsSync(join(repo, "templates/web/src/lib/cookie.ts"))).toBe(false);
  });

  it("원본 폴더가 비어도 삭제 파일만 지우고 앱 파일은 보존한다", () => {
    const repo = makeRepo();
    syncSharedAssets(repo, load(repo));
    for (const path of ["src", ".claude", ".cache", "node_modules"]) {
      rmSync(join(repo, "shared/nextjs", path), { recursive: true });
    }
    syncSharedAssets(repo, load(repo));
    expect(existsSync(join(repo, "templates/web/src/lib/cookie.ts"))).toBe(false);
    expect(read(repo, "templates/web/src/app/page.tsx")).toBe("// 앱 화면\n");
  });

  it.each(["다른 내용", "없음", "삭제 원본", "캐시 사본"])(
    "%s 사본은 원본 경로와 복원 방법을 알린다",
    (state) => {
      const repo = makeRepo();
      syncSharedAssets(repo, load(repo));
      const file = state === "캐시 사본" ? ".cache/example.txt" : "src/lib/cookie.ts";
      if (state === "없음") rmSync(join(repo, "templates/web", file));
      else if (state === "삭제 원본") rmSync(join(repo, "shared/nextjs", file));
      else write(repo, `templates/web/${file}`, "// 다른 내용\n");
      const problems = verifyTemplate(repo, "web", load(repo));
      expect(problems).toHaveLength(1);
      expect(problems[0]).toBe(
        state === "삭제 원본"
          ? `${file}: 지운 원본(shared/nextjs/${file})의 사본이 남았다 — 앱 파일로 두려면 managedFiles에서 이 경로를 빼고, 아니면 pnpm sync로 지운다.`
          : `${file}: 사본이 원본과 다르다 — 원본(shared/nextjs/${file})을 고친 뒤 pnpm sync한다.`,
      );
      syncSharedAssets(repo, load(repo));
      expect(verifyTemplate(repo, "web", load(repo))).toEqual([]);
    },
  );

  it("온전한 사본은 템플릿의 다른 파일을 비교하지 않고 통과한다", () => {
    const repo = makeRepo();
    syncSharedAssets(repo, load(repo));
    expect(verifyTemplate(repo, "web", load(repo))).toEqual([]);
    const manifest = read(repo, "scripts/shared-assets.json");
    syncSharedAssets(repo, load(repo));
    expect(read(repo, "scripts/shared-assets.json")).toBe(manifest);
  });

  it("기존 폴더 항목은 낡은 파일과 설치물을 지우고 통째로 교체한다", () => {
    const repo = makeRepo();
    write(repo, "contract/mock/main.ts", "// 목 원본\n");
    write(repo, "contract/mock/node_modules/pkg/index.js", "설치물\n");
    write(repo, "templates/web/contract/mock/stale.ts", "// 낡은 파일\n");
    write(repo, "templates/web/contract/mock/node_modules/pkg/index.js", "낡은 설치물\n");
    save(repo, [overlay(), { source: "contract/mock", targets: [target("web", "contract/mock")] }]);
    syncSharedAssets(repo, load(repo));
    expect(read(repo, "templates/web/contract/mock/main.ts")).toBe("// 목 원본\n");
    expect(existsSync(join(repo, "templates/web/contract/mock/stale.ts"))).toBe(false);
    expect(existsSync(join(repo, "templates/web/contract/mock/node_modules"))).toBe(false);
    expect(read(repo, "templates/web/src/app/page.tsx")).toBe("// 앱 화면\n");
  });
});

describe("덮어 놓기 manifest 검사", () => {
  it.each([".", "", "base"])("템플릿 안의 %s 대상을 허용한다", (path) => {
    const repo = makeRepo();
    save(repo, [overlay([target("web", path)])]);
    expect(readSharedAssets(repo)).not.toBeInstanceOf(Array);
  });

  it.each(["../api", "a/../..", resolve("/outside")])(
    "템플릿 밖 %s 대상은 거절하고 아무것도 바꾸지 않는다",
    (path) => {
      const repo = makeRepo();
      save(repo, [overlay([target("web", path)])]);
      const raw = JSON.parse(read(repo, "scripts/shared-assets.json")) as SharedAssetsManifest;
      expect(() => syncSharedAssets(repo, raw)).toThrow(/assets\[0\]\.targets\[0\]\.path/);
      expect(read(repo, "templates/web/src/app/page.tsx")).toBe("// 앱 화면\n");
    },
  );

  it("overlay 원본 파일과 알 수 없는 mode는 거절한다", () => {
    const repo = makeRepo();
    save(repo, [
      { ...overlay(), source: "shared/nextjs/src/lib/cookie.ts" },
      { ...overlay(), mode: "merge" },
    ]);
    const problems = readSharedAssets(repo);
    expect(problems).toBeInstanceOf(Array);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/assets\[0\]\.source.*폴더/),
        expect.stringMatching(/assets\[1\]\.mode/),
      ]),
    );
  });

  it.each(["../outside", ".", "src/node_modules/pkg.js", "/absolute", "C:/outside", "src\\bad.ts"])(
    "삭제 기록의 %s 경로는 거절한다",
    (file) => {
      const repo = makeRepo();
      save(repo, [{ ...overlay([target("web", "base")]), managedFiles: [file] }]);
      expect(readSharedAssets(repo)).toEqual(
        expect.arrayContaining([expect.stringMatching(/managedFiles/)]),
      );
    },
  );

  it.each(["다른 overlay", "파일 항목", "삭제 기록", "상위 교체 폴더", "파일과 폴더"])(
    "%s의 겹친 쓰기를 동기화 전에 거절한다",
    (kind) => {
      const repo = makeRepo();
      let other: unknown;
      if (kind === "다른 overlay") other = overlay();
      else if (kind === "삭제 기록")
        other = {
          ...overlay([{ ...target(), managedFiles: ["src/lib/cookie.ts"] }]),
          source: "other",
          managedFiles: ["src/lib/cookie.ts"],
        };
      else if (kind === "상위 교체 폴더")
        other = { source: "other", targets: [target("web", "src")] };
      else
        other = {
          source: "other/plain.txt",
          targets: [target("web", kind === "파일과 폴더" ? "src/lib" : "src/lib/cookie.ts")],
        };
      write(repo, "other/plain.txt", "// 다른 원본\n");
      save(repo, [overlay(), other]);
      const raw = JSON.parse(read(repo, "scripts/shared-assets.json")) as SharedAssetsManifest;
      expect(() => syncSharedAssets(repo, raw)).toThrow(/겹/);
      expect(existsSync(join(repo, "templates/web/src/lib/cookie.ts"))).toBe(false);
    },
  );

  it("대상 상위 폴더의 링크는 거절하고 링크 밖의 파일을 보존한다", () => {
    const repo = makeRepo();
    write(repo, "outside/cookie.ts", "// 보존\n");
    rmSync(join(repo, "templates/web/src/lib"), { recursive: true });
    symlinkSync(join(repo, "outside"), join(repo, "templates/web/src/lib"), "junction");
    const raw = JSON.parse(read(repo, "scripts/shared-assets.json")) as SharedAssetsManifest;
    expect(() => syncSharedAssets(repo, raw)).toThrow(/링크/);
    expect(read(repo, "outside/cookie.ts")).toBe("// 보존\n");
  });

  it("원본 폴더의 링크는 거절하고 다른 위치에 대한 의존을 복사하지 않는다", () => {
    const repo = makeRepo();
    write(repo, "outside/index.ts", "// 저장소 밖을 가리킬 수 있는 링크\n");
    symlinkSync(join(repo, "outside"), join(repo, "shared/nextjs/linked"), "junction");
    const raw = JSON.parse(read(repo, "scripts/shared-assets.json")) as SharedAssetsManifest;
    expect(() => syncSharedAssets(repo, raw)).toThrow(/shared.*linked.*링크/);
    expect(existsSync(join(repo, "templates/web/src/lib/cookie.ts"))).toBe(false);
  });

  it("사본 자리가 앱 폴더이면 원본 안내와 함께 거절하고 안의 파일을 보존한다", () => {
    const repo = makeRepo();
    write(repo, "templates/web/src/lib/cookie.ts/local.ts", "// 보존할 앱 파일\n");
    const result = readSharedAssets(repo);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/shared\/nextjs\/src\/lib\/cookie.ts.*고친 뒤 pnpm sync/),
      ]),
    );
    expect(read(repo, "templates/web/src/lib/cookie.ts/local.ts")).toBe("// 보존할 앱 파일\n");
  });

  it.each([null, "src/lib/cookie.ts", [1], [""]])(
    "잘못된 삭제 기록 %j를 거절한다",
    (managedFiles) => {
      const repo = makeRepo();
      save(repo, [{ ...overlay(), managedFiles }]);
      expect(readSharedAssets(repo)).toEqual(
        expect.arrayContaining([expect.stringMatching(/managedFiles/)]),
      );
    },
  );

  it.each([null, "src/lib/cookie.ts", [1], ["../outside"]])(
    "대상의 잘못된 삭제 기록은 쓰기 전에 거절한다: %j",
    (history) => {
      const repo = makeRepo();
      save(repo, [{ ...overlay(), targets: [{ ...target(), managedFiles: history }] }]);
      expect(() => syncSharedAssets(repo, raw(repo))).toThrow(/targets\[0\]\.managedFiles/);
      expect(existsSync(join(repo, "templates/web/src/lib/cookie.ts"))).toBe(false);
    },
  );
});
