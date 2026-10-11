import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "./dispatch-fixture.mjs";
import { gitEnvironment } from "../../scripts/process.mjs";

const entries = {
  PreToolUse: "pre-tool-use.mjs",
  PostToolUse: "post-tool-use.mjs",
  SessionStart: "session-start.mjs",
  Stop: "stop-check.mjs",
};

function cli(f, event, input = {}, raw) {
  const result = spawnSync(process.execPath, [join(import.meta.dirname, entries[event])], {
    cwd: f.root,
    env: { ...gitEnvironment(), CLAUDE_PROJECT_DIR: f.root },
    input: raw ?? JSON.stringify({ cwd: f.root, ...input }),
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return { ...result, json: result.stdout.trim() ? JSON.parse(result.stdout) : undefined };
}

function withoutSettings(t) {
  const f = fixture(t);
  f.write("apps/docs/package.json", JSON.stringify({ name: "docs", private: true }));
  f.write("apps/docs/file.ts", "export const docs = true;\n");
  for (const app of ["api", "web"]) {
    const settings = JSON.parse(readFileSync(join(f.root, `apps/${app}/.claude/settings.json`)));
    settings.hooks.PreToolUse[0].matcher = "Bash|PowerShell|Edit|Write|MultiEdit";
    f.write(`apps/${app}/.claude/settings.json`, JSON.stringify(settings));
  }
  return f;
}

function registerDocs(f) {
  f.write(
    "apps/docs/.claude/settings.json",
    readFileSync(join(f.root, "apps/api/.claude/settings.json"), "utf8"),
  );
  f.write(
    "apps/docs/.claude/fake.mjs",
    readFileSync(join(f.root, "apps/api/.claude/fake.mjs"), "utf8").replace(
      "input.results?.api",
      "input.results?.docs",
    ),
  );
}

for (const tool of ["Bash", "PowerShell", "Edit", "Write", "MultiEdit"]) {
  test(`설정 없는 추가 패키지는 도구(${tool})를 막지 않고 등록된 앱 hook을 실행한다`, (t) => {
    const f = withoutSettings(t);
    const input = { tool_name: tool, tool_input: { file_path: "apps/docs/file.ts" } };
    const result = cli(f, "PreToolUse", input);
    assert.equal(result.status, 0);
    assert.equal(result.json, undefined);
    assert.equal(result.stderr, "");
    for (const app of ["api", "web"]) {
      assert.equal(f.calls(app).length, 1);
      assert.equal(JSON.parse(f.calls(app)[0].raw).tool_name, tool);
      assert.equal(f.calls(app)[0].cwd, join(f.root, "apps", app));
    }
    assert.equal(f.calls("docs").length, 0);
  });
}

test("설정 없는 패키지의 Write는 설정 파일을 만들 수 있고 다음 호출은 새 hook을 읽는다", (t) => {
  const f = withoutSettings(t);
  const repair = cli(f, "PreToolUse", {
    tool_name: "Write",
    tool_input: { file_path: "apps/docs/.claude/settings.json", content: "{}" },
  });
  assert.equal(repair.status, 0);
  assert.equal(repair.json, undefined);
  assert.equal(repair.stderr, "");
  registerDocs(f);
  const next = cli(f, "PreToolUse", {
    tool_name: "Bash",
    results: { docs: { json: { hookSpecificOutput: { additionalContext: "새 정책" } } } },
  });
  assert.equal(next.status, 0);
  assert.equal(next.json.hookSpecificOutput.additionalContext, "[docs]\n새 정책");
  assert.equal(f.calls("docs").length, 1);
  assert.equal(f.calls("api").length, 2);
  assert.equal(f.calls("web").length, 2);
});

test("SessionStart는 설정 없는 패키지를 건너뛰고 다른 앱 문맥을 보존한다", (t) => {
  const f = withoutSettings(t);
  const result = cli(f, "SessionStart", {
    source: "startup",
    results: { api: { text: "api 상태" }, web: { text: "web 상태" } },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(result.json, {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: "[api]\napi 상태\n\n[web]\nweb 상태",
    },
  });
  assert.equal(f.calls("api").length, 1);
  assert.equal(f.calls("web").length, 1);
});

test("PostToolUse는 설정 없는 앱 편집을 통과시키고 다른 앱 편집 hook을 유지한다", (t) => {
  const f = withoutSettings(t);
  const missing = cli(f, "PostToolUse", {
    tool_name: "Edit",
    tool_input: { file_path: "apps/docs/file.ts" },
  });
  assert.equal(missing.status, 0);
  assert.equal(missing.json, undefined);
  assert.equal(missing.stderr, "");
  assert.equal(f.calls("api").length + f.calls("web").length, 0);
  const registered = cli(f, "PostToolUse", {
    tool_name: "Edit",
    tool_input: { file_path: "apps/web/file.ts" },
    results: { web: { json: { hookSpecificOutput: { additionalContext: "web 편집" } } } },
  });
  assert.equal(registered.status, 0);
  assert.equal(registered.json.hookSpecificOutput.additionalContext, "[web]\nweb 편집");
  assert.equal(f.calls("web").length, 1);
});

test("Stop은 설정 없는 변경 앱을 건너뛰고 등록된 변경 앱의 문맥을 유지한다", (t) => {
  const f = withoutSettings(t);
  f.write("apps/web/file.ts", "web 변경\n");
  const result = cli(f, "Stop", {
    results: { web: { json: { hookSpecificOutput: { additionalContext: "web 검사" } } } },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(result.json, {
    hookSpecificOutput: { hookEventName: "Stop", additionalContext: "[web]\nweb 검사" },
  });
  assert.equal(f.calls("api").length, 1);
  assert.equal(f.calls("web").length, 1);
});

test("설정 없는 패키지가 있어도 루트 편집과 Stop 검사 오류를 보존한다", (t) => {
  const f = withoutSettings(t);
  const formatted = [];
  const edited = f.invoke(
    "PostToolUse",
    { tool_name: "Edit", tool_input: { file_path: "README.md" } },
    {
      rootFormat: (root, path) => {
        formatted.push([root, path]);
        return { status: 0 };
      },
    },
  );
  assert.equal(edited.code, 0);
  assert.equal(edited.json, undefined);
  assert.deepEqual(formatted, [[f.root, "README.md"]]);
  f.write("README.md", "루트 변경\n");
  const checked = [];
  const stopped = f.invoke(
    "Stop",
    {},
    {
      rootCheck: (root) => {
        checked.push(root);
        return { status: 1, stderr: "루트 검사 오류" };
      },
    },
  );
  assert.deepEqual(checked, [f.root]);
  assert.equal(stopped.json.decision, "block");
  assert.equal(stopped.json.reason, "[root]\n루트 검사 오류");
});

for (const [name, output, reason] of [
  [
    "JSON deny",
    {
      json: {
        hookSpecificOutput: {
          permissionDecision: "deny",
          permissionDecisionReason: "docs 정책 거부",
        },
      },
    },
    "docs 정책 거부",
  ],
  ["exit 2", { code: 2, stderr: "docs 실행 거부" }, "docs 실행 거부"],
]) {
  test(`추가 패키지의 실제 차단(${name})은 다른 앱의 allow보다 우선한다`, (t) => {
    const f = withoutSettings(t);
    registerDocs(f);
    const result = cli(f, "PreToolUse", {
      tool_name: "Bash",
      results: {
        api: { json: { hookSpecificOutput: { permissionDecision: "allow" } } },
        docs: output,
      },
    });
    assert.equal(result.status, 0);
    assert.equal(result.json.hookSpecificOutput.permissionDecision, "deny");
    assert.equal(result.json.hookSpecificOutput.permissionDecisionReason, `[docs]\n${reason}`);
    assert.equal(f.calls("docs").length, 1);
    assert.equal(f.calls("api").length, 1);
    assert.equal(f.calls("web").length, 1);
  });
}

for (const [name, text, diagnostic] of [
  ["깨진 JSON", "{", /JSON|position|property/i],
  [
    "잘못된 exec form",
    JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "node" }] }] } }),
    /exec form/,
  ],
]) {
  test(`존재하는 추가 앱 설정(${name})은 계속 거부한다`, (t) => {
    const f = withoutSettings(t);
    f.write("apps/docs/.claude/settings.json", text);
    const result = cli(f, "PreToolUse", { tool_name: "Bash" });
    assert.equal(result.status, 0);
    assert.equal(result.json.hookSpecificOutput.permissionDecision, "deny");
    assert.match(result.json.hookSpecificOutput.permissionDecisionReason, /^\[docs\]\n/);
    assert.match(result.json.hookSpecificOutput.permissionDecisionReason, diagnostic);
    assert.equal(f.calls("api").length, 1);
    assert.equal(f.calls("web").length, 1);
  });
}

test("설정 경로가 파일 대신 디렉터리면 누락으로 숨기지 않고 거부한다", (t) => {
  const f = withoutSettings(t);
  mkdirSync(join(f.root, "apps/docs/.claude/settings.json"), { recursive: true });
  const result = cli(f, "PreToolUse", { tool_name: "Bash" });
  assert.equal(result.json.hookSpecificOutput.permissionDecision, "deny");
  assert.match(result.json.hookSpecificOutput.permissionDecisionReason, /EISDIR|EACCES|EPERM/);
});

test("읽기 권한 없는 기존 설정은 누락으로 숨기지 않고 거부한다", (t) => {
  if (process.platform === "win32" || process.getuid?.() === 0) {
    t.skip("POSIX 일반 사용자 권한으로 읽기 거부를 재현한다. Windows ACL·root는 별도 확인한다.");
    return;
  }
  const f = withoutSettings(t);
  registerDocs(f);
  const path = join(f.root, "apps/docs/.claude/settings.json");
  chmodSync(path, 0);
  try {
    assert.throws(() => readFileSync(path), { code: "EACCES" });
    const result = cli(f, "PreToolUse", { tool_name: "Bash" });
    assert.equal(result.json.hookSpecificOutput.permissionDecision, "deny");
    assert.match(result.json.hookSpecificOutput.permissionDecisionReason, /EACCES/);
  } finally {
    chmodSync(path, 0o600);
  }
});

test("설정의 끊어진 symlink entry는 실제 누락과 구분해 거부한다", (t) => {
  const f = withoutSettings(t);
  const path = join(f.root, "apps/docs/.claude/settings.json");
  mkdirSync(join(f.root, "apps/docs/.claude"), { recursive: true });
  try {
    symlinkSync(join(f.root, "missing-settings.json"), path, "file");
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip(`Windows 파일 symlink 권한 없음: ${error.code}`);
      return;
    }
    throw error;
  }
  assert.equal(lstatSync(path).isSymbolicLink(), true);
  assert.throws(() => readFileSync(path), { code: "ENOENT" });
  const result = cli(f, "PreToolUse", { tool_name: "Bash" });
  assert.equal(result.json.hookSpecificOutput.permissionDecision, "deny");
  assert.match(result.json.hookSpecificOutput.permissionDecisionReason, /\[docs\][\s\S]*ENOENT/);
});

test("설정 없는 패키지에서도 일반 hook 오류와 다른 앱 문맥을 JSON으로 함께 보존한다", (t) => {
  const f = withoutSettings(t);
  const result = cli(f, "PreToolUse", {
    tool_name: "Bash",
    results: {
      api: { code: 1, stderr: "api 일반 오류" },
      web: { json: { hookSpecificOutput: { additionalContext: "web 문맥" } } },
    },
  });
  assert.equal(result.status, 0);
  assert.deepEqual(result.json, {
    systemMessage: "[api] api 일반 오류",
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "[web]\nweb 문맥" },
  });
});

test("설정 누락 예외는 잘못된 hook 입력과 git 상태 오류를 숨기지 않는다", (t) => {
  const f = withoutSettings(t);
  const invalid = cli(f, "PreToolUse", {}, "{");
  assert.equal(invalid.status, 0);
  assert.equal(invalid.json.hookSpecificOutput.permissionDecision, "deny");
  assert.match(
    invalid.json.hookSpecificOutput.permissionDecisionReason,
    /\[root\][\s\S]*hook 입력/,
  );
  const stopped = f.invoke(
    "Stop",
    {},
    {
      run: (_command, args) =>
        args[0] === "rev-parse"
          ? { status: 0, stdout: "true" }
          : { status: 1, stderr: "git 상태 오류" },
    },
  );
  assert.equal(stopped.json.decision, "block");
  assert.match(stopped.json.reason, /\[root\][\s\S]*git 상태 오류/);
});
