import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { executeOwned } from "./native/command.mjs";

function processPort() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const calls = [];
  return {
    child,
    calls,
    deps: {
      start(argv, options) {
        calls.push({ argv, options });
        return child;
      },
      async stop(owned) {
        assert.equal(owned, child);
        calls.push("stopped-owned");
        child.emit("close", null, "SIGINT");
      },
    },
  };
}
test("interrupts stop only the owned child and preserve the signal exit code", async () => {
  const scope = processPort(),
    controller = new AbortController();
  const promise = executeOwned(
    ["native-tool", "literal path;$()"],
    { signal: controller.signal, cwd: "owned directory", output: () => {} },
    scope.deps,
  );
  controller.abort(130);
  assert.equal((await promise).code, 130);
  assert.equal(scope.calls.filter((item) => item === "stopped-owned").length, 1);
  assert.deepEqual(scope.calls[0].argv, ["native-tool", "literal path;$()"]);
  assert.equal(scope.calls[0].options.shell, undefined);
});
test("diagnostics are redacted before capture/output, including values split across chunks", async () => {
  const scope = processPort(),
    logs = [];
  const promise = executeOwned(
    ["native-tool"],
    { cwd: "owned directory", output: (line) => logs.push(line), secrets: ["private-password"] },
    scope.deps,
  );
  scope.child.stdout.write("input private-pass");
  scope.child.stdout.write("word\nhttps://api.example/path?token=one-use\n");
  scope.child.emit("close", 7, null);
  const result = await promise;
  assert.equal(result.code, 7);
  assert.equal(`${result.stdout}${logs.join()}`.includes("private-password"), false);
  assert.equal(`${result.stdout}${logs.join()}`.includes("one-use"), false);
});
