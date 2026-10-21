import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareNativeProject, cleanNativeProject } from "./native/owned.mjs";
import { maestroFailureLog } from "./native/logs.mjs";
test("only redacted Maestro text diagnostics survive owned raw-trace cleanup", () => {
  const source = mkdtempSync(join(tmpdir(), "aitpl-maestro-log-test-"));
  let owned;
  try {
    owned = prepareNativeProject(source);
    const raw = join(owned.parent, "raw-maestro/auth");
    mkdirSync(raw, { recursive: true });
    writeFileSync(
      join(raw, "maestro.log"),
      'Launch failed: Activity not found\npassword="fixture-private-value" https://example.com/callback?code=opaque\n',
    );
    writeFileSync(join(raw, "commands.json"), "must not copy commands");
    const log = maestroFailureLog(owned, "auth", ["fixture-private-value"]);
    assert.match(log, /Activity not found/);
    assert.doesNotMatch(log, /fixture-private-value|opaque|commands|example.com/);
    assert.throws(() => maestroFailureLog({ parent: source }, "auth", []), /ownership/);
  } finally {
    if (owned) cleanNativeProject(owned);
    rmSync(source, { recursive: true, force: true });
  }
});
