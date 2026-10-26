import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateFiles, writeGenerated, readGenerationConfig } from "./generate.ts";

test("check reports stale files without writing them", async () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-expo-gen-"));
  try {
    assert.throws(() => readGenerationConfig(root), /gen.config.json/);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/file.ts"), "old");
    assert.throws(() => writeGenerated(root, { "src/file.ts": "new" }, true), /stale/);
    assert.equal(readFileSync(join(root, "src/file.ts"), "utf8"), "old");
    writeGenerated(root, { "src/file.ts": "new" }, false);
    assert.equal(readFileSync(join(root, "src/file.ts"), "utf8"), "new");
    await assert.rejects(generateFiles(root, "not: an-openapi"), /OpenAPI|schema/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
