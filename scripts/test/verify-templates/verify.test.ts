import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncSharedAssets } from "../../src/sync/sync.ts";
import type { SharedAssetsManifest } from "../../src/verify-templates/manifest.ts";
import { verifyTemplate } from "../../src/verify-templates/verify.ts";

const WEB = "templates/web";
const COMMANDS = ["setup", "dev", "check", "fix", "test", "test:e2e", "gen"];
const HOOK = { type: "command", command: "node", args: [".claude/hooks/check.mjs"] };
const EVENTS = ["PostToolUse", "Stop", "PreToolUse", "SessionStart"];

const shared: SharedAssetsManifest = {
  assets: [{ source: "contract", targets: [{ template: "web", path: "contract" }] }],
};

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function writeJson(root: string, path: string, value: unknown): void {
  write(root, path, JSON.stringify(value));
}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    name: "web",
    kind: "frontend",
    runner: "pnpm",
    goldenModule: "src/features/posts",
    ...overrides,
  };
}

/** 하네스 표준을 모두 지킨 web 템플릿과 공유 자산 원본을 가진 임시 저장소. */
function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "verify-"));
  writeJson(repo, `${WEB}/template.json`, manifest());
  write(repo, `${WEB}/AGENTS.md`, "# web\n");
  write(repo, `${WEB}/CLAUDE.md`, "@AGENTS.md\n");
  writeJson(repo, `${WEB}/package.json`, {
    scripts: Object.fromEntries(COMMANDS.map((command) => [command, "echo"])),
  });
  writeJson(repo, `${WEB}/.claude/settings.json`, {
    hooks: Object.fromEntries(EVENTS.map((event) => [event, [{ hooks: [HOOK] }]])),
  });
  write(repo, `${WEB}/.env.example`, "API_BASE_URL=\n");
  write(repo, `${WEB}/docs/recipes/add-feature.md`, "# 기능 추가\n");
  write(repo, `${WEB}/src/features/posts/index.ts`, "export {};\n");
  write(repo, "contract/openapi.yaml", "openapi: 3.1.0\n");
  write(repo, `${WEB}/contract/openapi.yaml`, "openapi: 3.1.0\n");
  return repo;
}

const verify = (repo: string) => verifyTemplate(repo, "web", shared);

describe("verifyTemplate", () => {
  it("하네스 표준을 모두 지키면 통과한다", () => {
    expect(verify(makeRepo())).toEqual([]);
  });

  it("template.json이 없으면 무엇을 적을지 알려 준다", () => {
    const repo = makeRepo();
    rmSync(join(repo, WEB, "template.json"));
    expect(verify(repo)).toEqual([
      "template.json이 없다. name, kind, runner, goldenModule을 적는다.",
    ]);
  });

  it("빠진 명령을 잡고, 백엔드는 db 명령도 요구한다", () => {
    const repo = makeRepo();
    writeJson(repo, `${WEB}/template.json`, manifest({ kind: "backend" }));
    const problems = verify(repo);
    expect(problems).toContain('명령 "db:migrate"가 없다(docs/harness/standard.md의 명령 어휘).');
    expect(problems).toContain('명령 "db:reset"가 없다(docs/harness/standard.md의 명령 어휘).');
  });

  it("아직 검사 방법이 없는 runner는 구현하라고 알린다", () => {
    const repo = makeRepo();
    writeJson(repo, `${WEB}/template.json`, manifest({ runner: "uv" }));
    expect(verify(repo)[0]).toMatch(/runner "uv"의 명령 검사는 아직 없다/);
  });

  it("쉘 형식(args 없음) hook을 잡는다", () => {
    const repo = makeRepo();
    const hooks: Record<string, unknown> = Object.fromEntries(
      EVENTS.map((event) => [event, [{ hooks: [HOOK] }]]),
    );
    hooks.Stop = [{ hooks: [{ type: "command", command: "node .claude/hooks/check.mjs" }] }];
    writeJson(repo, `${WEB}/.claude/settings.json`, { hooks });
    expect(verify(repo)).toEqual(["Stop hook이 없거나 exec form(command + args)이 아니다."]);
  });

  it("필수 파일과 골든 모듈이 없으면 잡는다", () => {
    const repo = makeRepo();
    rmSync(join(repo, WEB, ".env.example"));
    rmSync(join(repo, WEB, "docs"), { recursive: true });
    rmSync(join(repo, WEB, "src"), { recursive: true });
    expect(verify(repo)).toEqual([
      ".env.example이 없다.",
      "docs/recipes/에 레시피(.md)가 하나도 없다.",
      "골든 모듈 src/features/posts이 없다.",
    ]);
  });

  it("지침 파일 짝이 맞지 않으면 잡는다", () => {
    const repo = makeRepo();
    rmSync(join(repo, WEB, "CLAUDE.md"));
    expect(verify(repo)[0]).toMatch(/^CLAUDE\.md: AGENTS\.md 옆에/);
  });

  it("공유 자산 사본이 원본과 다르면 잡고, sync하면 복구된다", () => {
    const repo = makeRepo();
    write(repo, `${WEB}/contract/openapi.yaml`, "openapi: 3.0.0\n");
    expect(verify(repo)).toEqual([
      "contract가 원본 contract와 다르다(openapi.yaml). pnpm sync를 돌린다.",
    ]);
    syncSharedAssets(repo, shared);
    expect(verify(repo)).toEqual([]);
  });
});
