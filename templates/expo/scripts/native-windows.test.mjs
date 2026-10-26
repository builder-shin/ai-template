import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prepareNativeProject, cleanNativeProject } from "./native/owned.mjs";
import { prepareWindowsMaestro } from "./native/windows.mjs";
import { maestroCommand } from "./native/maestro.mjs";
test("Windows Maestro state and compiled ABI adapter stay inside the owned run and retain the pinned distribution", async () => {
  const source = mkdtempSync(join(tmpdir(), "aitpl-maestro-windows-test-"));
  let owned;
  try {
    owned = prepareNativeProject(source);
    const calls = [];
    const adapter = await prepareWindowsMaestro("C:/Java 21/bin/java.exe", owned, {
      platform: "win32",
      execute: async (argv) => {
        calls.push(argv);
        if (!argv.includes("-d"))
          return { code: 0, stdout: "Native Maestro state verified.\n", stderr: "" };
        const output = join(argv[argv.indexOf("-d") + 1], "maestro/cli/db");
        mkdirSync(output, { recursive: true });
        writeFileSync(join(output, "KeyValueStore.class"), "compiled fixture");
        return { code: 0, stdout: "", stderr: "" };
      },
    });
    assert.equal(
      calls[0][0],
      "C:/Java 21/bin/javac.exe".replaceAll("/", process.platform === "win32" ? "\\" : "/"),
    );
    assert.ok(existsSync(adapter.state));
    assert.equal(calls.length, 2);
    assert.ok(calls[1].some((arg) => arg.endsWith("StoreProbe.java")));
    const argv = maestroCommand("java", "C:/original Maestro", ["--version"], adapter);
    assert.ok(argv.includes(`-Daitpl.maestro.stateDir=${adapter.state}`));
    assert.ok(argv[argv.indexOf("-cp") + 1].startsWith(adapter.classes));
    assert.ok(argv[argv.indexOf("-cp") + 1].includes("original Maestro"));
    await assert.rejects(prepareWindowsMaestro("java", owned, { platform: "win32" }), /existing/i);
    assert.equal(await prepareWindowsMaestro("java", owned, { platform: "linux" }), undefined);
  } finally {
    if (owned) cleanNativeProject(owned);
    rmSync(source, { recursive: true, force: true });
  }
});
