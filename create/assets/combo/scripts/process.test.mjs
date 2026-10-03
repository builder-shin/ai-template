import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitEnvironment, isGitRoot, run } from "./process.mjs";
import { setup } from "./setup.mjs";
import { dispatch } from "../.claude/hooks/dispatch.mjs";

for (const kind of ["bare", ".git"]) {
  test(`${kind} 안은 작업 트리 최상위가 아니므로 hook 설치와 Stop 검사를 건너뛴다`, (t) => {
    const repo = mkdtempSync(join(tmpdir(), "aitpl-combo-root-"));
    t.after(() => rmSync(repo, { recursive: true, force: true }));
    assert.equal(
      run("git", ["init", "--quiet", ...(kind === "bare" ? ["--bare"] : [])], {
        cwd: repo,
        env: gitEnvironment(),
      }).status,
      0,
    );
    const root = join(repo, kind === "bare" ? "combo" : ".git");
    mkdirSync(root, { recursive: true });
    assert.equal(isGitRoot(root), false);
    const calls = [];
    assert.equal(
      setup(root, {
        nodeVersion: "24.19.0",
        output: () => undefined,
        run: (command, args, options) => {
          if (command === "git") return run(command, args, options);
          calls.push(args);
          return { status: 0 };
        },
      }),
      0,
    );
    assert.equal(
      calls.some((args) => args.includes("lefthook")),
      false,
    );
    const result = dispatch("Stop", JSON.stringify({ cwd: root }), {
      root,
      rootCheck: () => assert.fail("작업 트리가 아니므로 검사하면 안 된다"),
    });
    assert.equal(result.code, 0);
    assert.equal(result.json.decision, undefined);
    assert.match(result.json.systemMessage, /git.* — .*git init/);
  });
}
