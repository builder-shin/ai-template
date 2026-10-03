import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./dispatch-fixture.mjs";

const events = ["PreToolUse", "PostToolUse", "Stop", "SessionStart"];

function commandHooks(f, hooks) {
  f.write(
    "apps/api/.claude/settings.json",
    JSON.stringify({
      hooks: Object.fromEntries(events.map((event) => [event, [{ hooks }]])),
    }),
  );
}

test("앱 hook ENOENT는 도구를 막지 않고 설치 안내를 한 번만 알린다", (t) => {
  const f = fixture(t);
  commandHooks(f, [{ type: "command", command: "aitpl-missing-uv", args: [] }]);
  for (const event of events) {
    const result = f.invoke(event, {
      tool_name: "Bash",
      tool_input: { file_path: "apps/api/file.ts" },
      results: { web: { text: "web 상태" } },
    });
    const message =
      event === "SessionStart" ? result.json.hookSpecificOutput.additionalContext : result.stderr;
    assert.equal(result.code, event === "SessionStart" ? 0 : 1);
    if (event !== "SessionStart") assert.equal(result.json, undefined);
    assert.match(message, /ENOENT.* — .*설치/s);
    if (event !== "SessionStart")
      assert.match(message.split("\n")[0], /^\[api\] .*ENOENT.* — .*설치/);
    assert.equal(message.match(/ENOENT/g)?.length, 1);
    if (event === "SessionStart") assert.match(message, /web 상태/);
  }
});

test("앱 hook 시간 초과는 권한 거부 대신 비차단 오류와 시간 안내를 출력한다", (t) => {
  const f = fixture(t);
  f.write("apps/api/.claude/slow.mjs", "setTimeout(() => {}, 10000);\n");
  commandHooks(f, [
    {
      type: "command",
      command: process.execPath,
      args: ["${CLAUDE_PROJECT_DIR}/.claude/slow.mjs"],
      timeout: 0.01,
    },
  ]);
  const result = f.invoke("PreToolUse", { tool_name: "Bash" });
  assert.equal(result.code, 1);
  assert.equal(result.json, undefined);
  assert.match(result.stderr, /ETIMEDOUT.* — .*시간/s);
  assert.match(result.stderr.split("\n")[0], /^\[api\] .*ETIMEDOUT.* — .*시간/);
});

test("SessionStart는 실행 오류를 중복 없이 다른 앱 요약과 함께 출력한다", (t) => {
  const f = fixture(t);
  commandHooks(f, [{ type: "command", command: "aitpl-missing-uv", args: [] }]);
  const result = f.invoke("SessionStart", { results: { web: { text: "web 상태" } } });
  const message = result.json.hookSpecificOutput.additionalContext;
  assert.equal(result.code, 0);
  assert.equal(message.match(/ENOENT/g)?.length, 1);
  assert.match(message, /web 상태/);
  assert.match(result.json.systemMessage, /^\[api\] .*ENOENT.* — .*설치/);
  assert.equal(result.json.systemMessage.match(/ENOENT/g)?.length, 1);
  assert.equal(result.stderr, undefined);
});

test("이미 고치는 방법이 있는 루트 실행 오류에는 안내를 덧붙이지 않는다", (t) => {
  const f = fixture(t);
  const result = f.invoke(
    "PostToolUse",
    { tool_input: { file_path: "README.md" } },
    {
      rootFormat: () => {
        throw new Error("pnpm을 찾을 수 없다 — pnpm을 설치한다.");
      },
    },
  );
  assert.equal(result.json.reason.match(/—/g)?.length, 1);
});

test("Stop과 PreToolUse의 차단 이유에도 다른 앱의 비차단 오류를 보존한다", (t) => {
  const f = fixture(t);
  f.write("apps/api/file.ts", "api 변경\n");
  f.write("apps/web/file.ts", "web 변경\n");
  for (const event of ["Stop", "PreToolUse"]) {
    const result = f.invoke(event, {
      tool_name: "Bash",
      results: { api: { code: 2, stderr: "api 차단" }, web: { code: 1, stderr: "web 일반 오류" } },
    });
    const reason =
      event === "Stop"
        ? result.json.reason
        : result.json.hookSpecificOutput.permissionDecisionReason;
    assert.match(reason, /api 차단/);
    assert.match(reason, /web 일반 오류/);
    assert.equal(reason.match(/api 차단/g)?.length, 1);
  }
});

test("PostToolUse의 차단과 실행 오류도 이유에 한 번씩 보존한다", (t) => {
  const f = fixture(t);
  commandHooks(f, [
    {
      type: "command",
      command: process.execPath,
      args: ["${CLAUDE_PROJECT_DIR}/.claude/fake.mjs"],
    },
    { type: "command", command: "aitpl-missing-uv", args: [] },
  ]);
  const result = f.invoke("PostToolUse", {
    tool_input: { file_path: "apps/api/file.ts" },
    results: { api: { code: 2, stderr: "api 차단" } },
  });
  assert.equal(result.json.decision, "block");
  assert.match(result.json.reason, /api 차단/);
  assert.match(result.json.reason, /ENOENT/);
  assert.equal(result.json.reason.match(/ENOENT/g)?.length, 1);
});

test("allow·ask·defer 결정과 함께 다른 앱의 비차단 오류를 사용자에게 보여 준다", (t) => {
  const f = fixture(t);
  for (const decision of ["allow", "ask", "defer"]) {
    const result = f.invoke("PreToolUse", {
      tool_name: "Bash",
      results: {
        api: {
          json: {
            hookSpecificOutput: { permissionDecision: decision, additionalContext: "api 문맥" },
          },
        },
        web: { code: 1, stderr: "web 일반 오류" },
      },
    });
    assert.equal(result.code, 0);
    assert.equal(result.json.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(result.json.hookSpecificOutput.permissionDecision, decision);
    assert.match(result.json.hookSpecificOutput.additionalContext, /api 문맥/);
    assert.equal(result.json.systemMessage, "[web] web 일반 오류");
    assert.equal(result.stderr, undefined);
  }
});

test("PreToolUse·PostToolUse·Stop 문맥과 비차단 실행 오류를 같은 JSON으로 출력한다", (t) => {
  const f = fixture(t);
  commandHooks(f, [
    {
      type: "command",
      command: process.execPath,
      args: ["${CLAUDE_PROJECT_DIR}/.claude/fake.mjs"],
    },
    { type: "command", command: "aitpl-missing-uv", args: [] },
  ]);
  for (const event of ["PreToolUse", "PostToolUse", "Stop"]) {
    const result = f.invoke(event, {
      tool_name: "Edit",
      tool_input: { file_path: "apps/api/file.ts" },
      results: { api: { json: { hookSpecificOutput: { additionalContext: "api 문맥" } } } },
    });
    assert.equal(result.code, 0);
    assert.equal(result.json.decision, undefined);
    assert.equal(result.json.hookSpecificOutput.hookEventName, event);
    assert.match(result.json.hookSpecificOutput.additionalContext, /api 문맥/);
    assert.match(result.json.systemMessage, /^\[api\] .*ENOENT.* — .*설치/);
    assert.equal(result.stderr, undefined);
  }
});

test("이미 고치는 방법이 있는 앱 설정·루트 오류에는 안내를 덧붙이지 않는다", (t) => {
  const f = fixture(t);
  commandHooks(f, [{ type: "prompt" }]);
  const invalid = f.invoke("PreToolUse", { tool_name: "Bash" });
  assert.equal(invalid.json.hookSpecificOutput.permissionDecisionReason.match(/—/g)?.length, 1);
  const rootError = f.invoke(
    "PostToolUse",
    {
      tool_input: { file_path: "README.md" },
    },
    {
      rootFormat: () => {
        throw new Error("pnpm을 찾을 수 없다 — pnpm을 설치한다.");
      },
    },
  );
  assert.equal(rootError.json.reason.match(/—/g)?.length, 1);
});
