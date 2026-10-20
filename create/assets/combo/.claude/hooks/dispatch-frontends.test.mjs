import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./dispatch-fixture.mjs";
import { formatFile } from "../../scripts/staged-format.mjs";

test("PostToolUse 외부 계약은 루트 포맷에서 제외하고 앱 hook 소유권을 유지한다", (t) => {
  const f = fixture(t, ["api", "web", "admin"]);
  f.write("contract/mock/src/main.ts", "export {};\n");
  const formatted = [];
  const rootFormat = (root, path) =>
    formatFile(root, path, (_command, args) => {
      formatted.push(args);
      return { status: 0 };
    });
  const result = f.invoke(
    "PostToolUse",
    {
      tool_name: "Edit",
      tool_input: { file_path: "contract/mock/src/main.ts" },
    },
    { rootFormat },
  );
  assert.equal(result.code, 0);
  assert.deepEqual(formatted, []);
  assert.equal(f.calls("web").length + f.calls("admin").length + f.calls("api").length, 0);
  f.invoke(
    "PostToolUse",
    { tool_name: "Edit", tool_input: { file_path: "apps/admin/file.ts" } },
    { rootFormat },
  );
  assert.equal(f.calls("admin").length, 1);
  assert.equal(f.calls("web").length + f.calls("api").length, 0);
  assert.deepEqual(formatted, []);
});

test("디스패처는 배치의 두 번째 프론트를 찾아 편집·계약·세션 hook을 실행한다", (t) => {
  const f = fixture(t, ["api", "web", "admin"]);
  f.invoke("PostToolUse", { tool_name: "Edit", tool_input: { file_path: "apps/admin/file.ts" } });
  assert.equal(f.calls("admin").length, 1);
  assert.equal(f.calls("web").length, 0);
  f.write("contract/typespec/main.tsp", "model Item {}\n");
  f.invoke("Stop", {}, { rootCheck: () => ({ status: 0 }) });
  assert.equal(f.calls("admin").length, 2);
  assert.equal(f.calls("web").length, 1);
  assert.equal(f.calls("api").length, 0);
  const result = f.invoke("SessionStart", { results: { admin: { text: "관리 상태" } } });
  assert.match(result.json.hookSpecificOutput.additionalContext, /\[admin\]\n관리 상태/);
});

test("프론트가 하나면 없는 web hook을 실행하지 않는다", (t) => {
  const f = fixture(t, ["api", "admin"]);
  assert.equal(f.invoke("SessionStart").json?.decision, undefined);
  assert.equal(f.calls("api").length, 1);
  assert.equal(f.calls("admin").length, 1);
  assert.equal(f.calls("web").length, 0);
});
