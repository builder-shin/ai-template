import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, parse } from "node:path";
import { prepareNativeProject, cleanNativeProject } from "./native/owned.mjs";

test("native compilation copies source without reading/copying environment, installs or existing native output", (t) => {
  const source = mkdtempSync(join(tmpdir(), "aitpl-native-source-test-"));
  try {
    writeFileSync(join(source, "package.json"), "{}\n");
    writeFileSync(join(source, ".env.local"), "private-do-not-copy\n");
    writeFileSync(join(source, ".env.example"), "PUBLIC_KEY=example\n");
    for (const name of ["node_modules", "android", "ios", "artifacts", ".cache", ".git"]) {
      mkdirSync(join(source, name));
      writeFileSync(join(source, name, "keep"), "owned fixture\n");
    }
    const copy = prepareNativeProject(source);
    t.after(() => cleanNativeProject(copy));
    if (process.platform === "win32")
      assert.equal(dirname(copy.parent).toLowerCase(), parse(tmpdir()).root.toLowerCase());
    assert.equal(readFileSync(join(copy.path, "package.json"), "utf8"), "{}\n");
    assert.equal(existsSync(join(copy.path, ".env.example")), true);
    for (const name of [
      ".env.local",
      "node_modules",
      "android",
      "ios",
      "artifacts",
      ".cache",
      ".git",
    ])
      assert.equal(existsSync(join(copy.path, name)), false);
    assert.throws(() => cleanNativeProject({ path: source, parent: source }), /ownership|owned/i);
    cleanNativeProject(copy);
    cleanNativeProject(copy);
    assert.equal(existsSync(copy.parent), false);
    assert.equal(existsSync(join(source, "android/keep")), true);
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
});
test("a linked source asset is rejected rather than copying an unrelated target", () => {
  const source = mkdtempSync(join(tmpdir(), "aitpl-native-source-test-"));
  const other = mkdtempSync(join(tmpdir(), "aitpl-native-link-test-"));
  try {
    writeFileSync(join(other, "keep"), "unrelated source\n");
    symlinkSync(other, join(source, "assets"), process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => prepareNativeProject(source), /link|symlink/i);
    assert.deepEqual(readdirSync(other), ["keep"]);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});
