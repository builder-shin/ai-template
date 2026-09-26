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
const SHELL_HOOK = { type: "command", command: "node .claude/hooks/check.mjs" };
const EVENTS = ["PostToolUse", "Stop", "PreToolUse", "SessionStart"];

const shellForm = (where: string) =>
  `.claude/settings.json ${where}: 쉘 형식 hook이다. 실행 파일은 command에, 인자는 args 배열에 적는다(exec form).`;

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

/** 필수 이벤트마다 exec form hook 하나를 두고, overrides로 이벤트를 바꾸거나 더한다. */
function writeHooks(repo: string, overrides: Record<string, unknown[]> = {}): void {
  const hooks = Object.fromEntries(EVENTS.map((event) => [event, [{ hooks: [HOOK] }]]));
  writeJson(repo, `${WEB}/.claude/settings.json`, { hooks: { ...hooks, ...overrides } });
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
  writeHooks(repo);
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
    writeHooks(repo, { Stop: [{ hooks: [SHELL_HOOK] }] });
    expect(verify(repo)).toEqual([
      "Stop hook이 없거나 exec form(command + args)이 아니다.",
      shellForm("hooks.Stop[0].hooks[0]"),
    ]);
  });

  it("exec form 옆의 쉘 형식 hook과 필수가 아닌 이벤트의 쉘 형식 hook도 잡는다", () => {
    const repo = makeRepo();
    writeHooks(repo, {
      Stop: [{ hooks: [HOOK] }, { hooks: [SHELL_HOOK] }],
      UserPromptSubmit: [{ hooks: [HOOK, SHELL_HOOK] }],
    });
    expect(verify(repo)).toEqual([
      shellForm("hooks.Stop[1].hooks[0]"),
      shellForm("hooks.UserPromptSubmit[0].hooks[1]"),
    ]);
  });

  it("command가 아닌 hook(prompt 등)은 exec form 검사에서 뺀다", () => {
    const repo = makeRepo();
    writeHooks(repo, {
      Stop: [{ hooks: [HOOK, { type: "prompt", prompt: "끝났는지 확인한다." }] }],
    });
    expect(verify(repo)).toEqual([]);
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

  it("템플릿 루트에 AGENTS.md와 CLAUDE.md가 없으면 둘 다 잡는다", () => {
    const noAgents =
      "AGENTS.md: 루트 AGENTS.md가 없다. 명령, 구조 지도, 핵심 규칙, 완료 기준, 문서 링크를 담아 만든다.";
    const neither = makeRepo();
    rmSync(join(neither, WEB, "AGENTS.md"));
    rmSync(join(neither, WEB, "CLAUDE.md"));
    expect(verify(neither)).toEqual([
      noAgents,
      'CLAUDE.md: AGENTS.md 옆에 "@AGENTS.md" 한 줄짜리 CLAUDE.md를 만든다.',
    ]);
    const claudeOnly = makeRepo();
    rmSync(join(claudeOnly, WEB, "AGENTS.md"));
    expect(verify(claudeOnly)[0]).toBe(noAgents);
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
