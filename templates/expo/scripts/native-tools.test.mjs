import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyArchive, maestroCommand, assertJavaVersion } from "./native/maestro.mjs";

test("pinned archive verification fails before extraction for modified bytes", () => {
  const bytes = Buffer.from("owned fixture archive"),
    hash = createHash("sha256").update(bytes).digest("hex");
  verifyArchive(bytes, hash);
  assert.throws(() => verifyArchive(Buffer.from("changed"), hash), /checksum/i);
});
test("Maestro uses a shell-free Java classpath even with Windows spaces", () => {
  const argv = maestroCommand("C:/Program Files/Java/bin/java.exe", "C:/native tools/maestro", [
    "--device",
    "emulator-5554",
    "test",
    "e2e",
  ]);
  assert.equal(argv[0], "C:/Program Files/Java/bin/java.exe");
  assert.ok(argv.includes("maestro.cli.AppKt"));
  assert.ok(argv.some((arg) => arg.endsWith("lib/*") || arg.endsWith("lib\\*")));
  assert.deepEqual(argv.slice(-4), ["--device", "emulator-5554", "test", "e2e"]);
  assert.equal(
    argv.some((arg) => /(?:cmd\.exe|\.bat|install\.sh)$/.test(arg)),
    false,
  );
});
test("the native toolchain requires Java21 before starting a build", () => {
  assertJavaVersion('openjdk version "21.0.13"');
  assert.throws(() => assertJavaVersion('openjdk version "17.0.20"'), /Java 21/);
  assert.throws(() => assertJavaVersion("unrecognized"), /Java 21/);
});
