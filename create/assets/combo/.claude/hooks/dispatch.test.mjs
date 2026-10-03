import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { dispatch } from "./dispatch.mjs";
import { fixture, linkedRoot } from "./dispatch-fixture.mjs";
import { gitEnvironment } from "../../scripts/process.mjs";
import { formatFile } from "../../scripts/staged-format.mjs";

test("PostToolUse는 고친 앱만 골라 같은 입력과 앱 cwd·환경을 넘긴다", (t) => {
  const f = fixture(t);
  const input = {
    cwd: f.root,
    tool_name: "Write",
    tool_input: { file_path: join(f.root, "apps/web/file.ts") },
    results: {
      web: {
        json: {
          hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "남은 린트" },
        },
      },
    },
  };
  const raw = JSON.stringify(input);
  const result = dispatch("PostToolUse", raw, { root: f.root });
  assert.equal(result.json.hookSpecificOutput.additionalContext, "[web]\n남은 린트");
  assert.equal(f.calls("api").length, 0);
  assert.deepEqual(
    f.calls("web").map(({ raw, cwd, project }) => ({ raw, cwd, project })),
    [{ raw, cwd: join(f.root, "apps/web"), project: join(f.root, "apps/web") }],
  );
});

test("앱 hook에도 pnpm 진입점을 넘겨 직접 node 세션의 생성물 검사를 지원한다", (t) => {
  const f = fixture(t);
  const bin = join(f.root, ".cache/bin");
  const entry = join(bin, "node_modules/pnpm/bin/pnpm.cjs");
  f.write(".cache/bin/node_modules/pnpm/bin/pnpm.cjs", "// fixture\n");
  const previous = { path: process.env.PATH, npm: process.env.npm_execpath };
  process.env.PATH = `${bin}${delimiter}${process.env.PATH}`;
  delete process.env.npm_execpath;
  try {
    f.invoke("SessionStart");
    assert.equal(f.calls("web")[0].npmEntry, entry);
  } finally {
    if (previous.path === undefined) delete process.env.PATH;
    else process.env.PATH = previous.path;
    if (previous.npm === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = previous.npm;
  }
});

test("PostToolUse 루트 파일은 루트 포맷만 돌리고 밖의 경로는 건너뛴다", (t) => {
  const f = fixture(t);
  const paths = [];
  const rootFormat = (_root, path) => {
    return formatFile(_root, path, (_command, args) => {
      paths.push(args.at(-1));
      return { status: 0 };
    });
  };
  for (const path of [
    "README.md",
    "scripts/a.mjs",
    ".claude/hooks/x.mjs",
    ".github/workflows/ci.yml",
  ]) {
    f.write(path, "// fixture\n");
    f.invoke(
      "PostToolUse",
      { tool_name: "Edit", tool_input: { file_path: join(f.root, path) } },
      { rootFormat },
    );
  }
  f.invoke(
    "PostToolUse",
    { tool_name: "Edit", tool_input: { file_path: "../outside.ts" } },
    { rootFormat },
  );
  assert.deepEqual(paths, [
    "README.md",
    "scripts/a.mjs",
    ".claude/hooks/x.mjs",
    ".github/workflows/ci.yml",
  ]);
  assert.equal(f.calls("api").length + f.calls("web").length, 0);
});

test("PostToolUse 앱의 block과 exit 2 오류는 도구 결과 문맥에 합친다", (t) => {
  const f = fixture(t);
  const input = { tool_name: "Edit", tool_input: { file_path: "apps/api/file.ts" } };
  const blocked = f.invoke("PostToolUse", {
    ...input,
    results: { api: { json: { decision: "block", reason: "린트 오류" } } },
  });
  assert.equal(blocked.json.decision, "block");
  assert.match(blocked.json.reason, /api.*\n린트 오류/);
  const failed = f.invoke("PostToolUse", {
    ...input,
    results: { api: { code: 2, stderr: "포맷 오류" } },
  });
  assert.equal(failed.json.decision, "block");
  assert.match(failed.json.reason, /포맷 오류/);
});

test("PreToolUse는 deny·exit 2를 합치고 allow가 거부를 덮지 않는다", (t) => {
  const f = fixture(t);
  const denied = f.invoke("PreToolUse", {
    tool_name: "Bash",
    tool_input: { command: "git push --force" },
    results: {
      api: {
        json: { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } },
      },
      web: {
        json: {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "강제 push",
          },
        },
      },
    },
  });
  assert.equal(denied.json.hookSpecificOutput.permissionDecision, "deny");
  assert.match(denied.json.hookSpecificOutput.permissionDecisionReason, /\[web\].*\n강제 push/);
  assert.equal(f.calls("api").length, 1);
  assert.equal(f.calls("web").length, 1);
  const both = f.invoke("PreToolUse", {
    tool_name: "PowerShell",
    results: {
      api: { code: 2, stderr: "DB 거부" },
      web: {
        json: {
          hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "hook 거부" },
        },
      },
    },
  });
  assert.match(both.json.hookSpecificOutput.permissionDecisionReason, /DB 거부[\s\S]*hook 거부/);
});

test("PreToolUse의 ask는 보존하며 빈 결과는 권한을 추가하지 않는다", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke("PreToolUse", { tool_name: "Bash" }).json, undefined);
  const result = f.invoke("PreToolUse", {
    tool_name: "Bash",
    results: {
      web: {
        json: {
          hookSpecificOutput: { permissionDecision: "ask", permissionDecisionReason: "확인 필요" },
        },
      },
    },
  });
  assert.equal(result.json.hookSpecificOutput.permissionDecision, "ask");
});

test("exit 2는 JSON allow보다 먼저 거부하고 JSON deny 이유를 stderr보다 먼저 쓴다", (t) => {
  const f = fixture(t);
  const result = f.invoke("PreToolUse", {
    tool_name: "Bash",
    results: {
      api: {
        code: 2,
        stderr: "exit 2 거부",
        json: { hookSpecificOutput: { permissionDecision: "allow" } },
      },
      web: {
        code: 2,
        stderr: "낮은 우선순위",
        json: {
          hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "JSON 거부" },
        },
      },
    },
  });
  assert.equal(result.json.hookSpecificOutput.permissionDecision, "deny");
  assert.match(
    result.json.hookSpecificOutput.permissionDecisionReason,
    /exit 2 거부[\s\S]*JSON 거부/,
  );
  assert.doesNotMatch(result.json.hookSpecificOutput.permissionDecisionReason, /낮은 우선순위/);
});

test("SessionStart는 한 앱이 실패해도 다른 앱 요약을 보존하고 성공으로 끝난다", (t) => {
  const f = fixture(t);
  const result = f.invoke("SessionStart", {
    results: { api: { code: 2, stderr: "설정 확인 필요" }, web: { text: "web 상태" } },
  });
  assert.equal(result.code, 0);
  assert.match(result.json.hookSpecificOutput.additionalContext, /설정 확인 필요/);
  assert.match(result.json.hookSpecificOutput.additionalContext, /web 상태/);
});

test("Stop은 새 파일이 있는 두 앱의 block·exit 2 이유를 모두 모은다", (t) => {
  const f = fixture(t);
  f.write("apps/api/new.py", "새 api\n");
  f.write("apps/web/new.ts", "새 web\n");
  const result = f.invoke("Stop", {
    results: {
      api: { code: 2, stderr: "api 실패" },
      web: { json: { decision: "block", reason: "web 실패" } },
    },
  });
  assert.equal(result.json.decision, "block");
  assert.match(result.json.reason, /api 실패[\s\S]*web 실패/);
});

test("SessionStart는 앱 JSON·일반 stdout을 이름과 함께 이어 붙인다", (t) => {
  const f = fixture(t);
  const result = f.invoke("SessionStart", {
    results: {
      api: {
        json: {
          hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "인프라 꺼짐" },
        },
      },
      web: { text: "생성물 최신" },
    },
  });
  assert.equal(
    result.json.hookSpecificOutput.additionalContext,
    "[api]\n인프라 꺼짐\n\n[web]\n생성물 최신",
  );
});

test("Stop은 깨끗한 저장소와 재진입을 검사 없이 통과시킨다", (t) => {
  const f = fixture(t);
  const rootCheck = () => {
    throw new Error("검사하면 안 됨");
  };
  assert.equal(f.invoke("Stop", {}, { rootCheck }).json, undefined);
  f.write("apps/api/file.ts", "바뀜\n");
  assert.equal(f.invoke("Stop", { stop_hook_active: true }, { rootCheck }).json, undefined);
  assert.equal(f.calls("api").length + f.calls("web").length, 0);
});

test("Stop은 바뀐 앱의 이유와 루트 검사 실패만 합친다", (t) => {
  const f = fixture(t);
  f.write("apps/api/file.ts", "api 변경\n");
  f.write("README.md", "루트 변경\n");
  const result = f.invoke(
    "Stop",
    { results: { api: { json: { decision: "block", reason: "api 타입 오류" } } } },
    { rootCheck: () => ({ status: 1, stdout: "루트 포맷 오류" }) },
  );
  assert.equal(result.json.decision, "block");
  assert.match(result.json.reason, /api 타입 오류/);
  assert.match(result.json.reason, /루트 포맷 오류/);
  assert.equal(f.calls("web").length, 0);
});

test("Stop은 git 밖이나 상위 저장소 안이면 검사 없이 비차단 안내를 출력한다", (t) => {
  const parent = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), "aitpl-stop-no-git-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  parent.write("nested/README.md", "# combo\n");
  const rootCheck = () => {
    assert.fail("자기 저장소가 아니면 루트 검사를 실행하지 않는다");
  };
  for (const root of [outside, join(parent.root, "nested")]) {
    const result = dispatch("Stop", JSON.stringify({ cwd: root }), { root, rootCheck });
    assert.equal(result.code, 0);
    assert.equal(result.json, undefined);
    assert.match(result.stderr, /git.* — .*git init/);
  }
  assert.equal(parent.calls("api").length + parent.calls("web").length, 0);
});

for (const [name, rootPath] of [
  ["junction·symlink", (root, t) => linkedRoot(root, t)],
  ...(process.platform === "win32"
    ? [["소문자 드라이브", (root) => root[0].toLowerCase() + root.slice(1)]]
    : []),
]) {
  test(`Stop은 ${name}로 연 자기 저장소에서도 앱과 루트 검사를 실행한다`, (t) => {
    const f = fixture(t);
    const root = rootPath(f.root, t);
    f.write("apps/api/file.ts", "api 변경\n");
    f.write("README.md", "루트 변경\n");
    const checked = [];
    const result = dispatch(
      "Stop",
      JSON.stringify({ cwd: root, results: { api: { code: 2, stderr: "api 차단" } } }),
      {
        root,
        rootCheck: (path) => {
          checked.push(path);
          return { status: 0 };
        },
      },
    );
    assert.equal(result.json?.decision, "block");
    assert.match(result.json.reason, /api 차단/);
    assert.deepEqual(checked, [root]);
    assert.equal(f.calls("api").length, 1);
    assert.equal(f.calls("web").length, 0);
  });
}

test("Stop은 rename의 양쪽 앱과 새 파일을 보고 git 환경을 격리한다", (t) => {
  const f = fixture(t);
  f.git("mv", "apps/api/file.ts", "apps/web/renamed.ts");
  const previous = process.env.GIT_DIR;
  process.env.GIT_DIR = join(f.root, "missing-git");
  try {
    assert.equal(f.invoke("Stop").json, undefined);
    assert.equal(f.calls("api").length, 1);
    assert.equal(f.calls("web").length, 1);
  } finally {
    if (previous === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previous;
  }
});

test("앱 설정을 매번 읽고 matcher가 다른 hook은 실행하지 않는다", (t) => {
  const f = fixture(t);
  f.write(
    "apps/api/.claude/settings.json",
    JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: "Edit|Write", hooks: [{ type: "command", command: "없는-명령" }] }],
      },
    }),
  );
  assert.equal(f.invoke("PreToolUse", { tool_name: "Bash" }).json, undefined);
  assert.equal(f.calls("api").length, 0);
  const result = f.invoke("PreToolUse", { tool_name: "Edit" });
  assert.equal(result.json.hookSpecificOutput.permissionDecision, "deny");
  assert.match(result.json.hookSpecificOutput.permissionDecisionReason, /api/);
});

test("앱의 일반 오류는 비차단 오류로 알리고 깨진 설정은 Stop을 막는다", (t) => {
  const f = fixture(t);
  f.write("apps/web/file.ts", "변경\n");
  const result = f.invoke("Stop", { results: { web: { code: 1, stderr: "실행 실패" } } });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /실행 실패/);
  f.write("apps/web/.claude/settings.json", "{잘못된 설정");
  assert.equal(f.invoke("Stop").json.decision, "block");
});

test("exec 진입점은 표준 입력을 받아 JSON 한 줄로 응답한다", (t) => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, [join(import.meta.dirname, "pre-tool-use.mjs")], {
    input: JSON.stringify({
      cwd: f.root,
      tool_name: "Bash",
      results: { web: { code: 2, stderr: "거부" } },
    }),
    env: { ...gitEnvironment(), CLAUDE_PROJECT_DIR: f.root },
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(result.stdout.trim().split("\n").length, 1);
});
