import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareNativeProject, cleanNativeProject } from "./native/owned.mjs";
import { seedAndroidImage } from "./native/media.mjs";
import { fixtureImage } from "./native/fixture.mjs";

test("the actual device PNG has valid chunk checksums, including IDAT", () => {
  for (let offset = 8; offset < fixtureImage.length;) {
    const length = fixtureImage.readUInt32BE(offset),
      bytes = fixtureImage.subarray(offset + 4, offset + 8 + length);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    assert.equal(
      fixtureImage.readUInt32BE(offset + 8 + length),
      (crc ^ 0xffffffff) >>> 0,
      bytes.subarray(0, 4).toString(),
    );
    offset += 12 + length;
  }
});

async function fixture(run) {
  const source = mkdtempSync(join(tmpdir(), "aitpl-media-test-"));
  const owned = prepareNativeProject(source),
    record = join(source, "media.json");
  writeFileSync(join(owned.path, "native.png"), "owned-image");
  try {
    await run(owned, record);
  } finally {
    cleanNativeProject(owned);
    rmSync(source, { recursive: true, force: true });
  }
}
test("closed SDK image transfer waits for exact indexed bytes and cleans only its atomically claimed directory", async () => {
  await fixture(async (owned, record) => {
    const calls = [];
    let polls = 0,
      paused = 0;
    const stop = await seedAndroidImage({ deviceId: "emulator-5554" }, owned, {
      adb: "adb",
      record,
      pause: async () => {
        paused++;
      },
      execute: async (argv) => {
        calls.push(argv);
        if (argv.includes("query"))
          return { code: 0, stdout: ++polls === 1 ? "No result found." : "Row: 0 _id=7, _size=11" };
        return { code: 0, stdout: "" };
      },
    });
    const owner = JSON.parse(readFileSync(record, "utf8"));
    assert.match(owner.file, /^\/sdcard\/Pictures\/aitpl-native-[a-f0-9-]+\/native\.png$/);
    assert.equal(paused, 1);
    assert.ok(
      calls.findIndex((a) => a.includes("push")) < calls.findIndex((a) => a.includes("broadcast")),
    );
    const where = "\"relative_path='" + owner.relativePath + "' AND _display_name='native.png'\"";
    assert.ok(calls.some((a) => a.includes(where)));
    await stop();
    assert.ok(calls.some((a) => a.includes("delete") && a.includes(where)));
    assert.ok(calls.some((a) => a.includes("rm") && a.at(-1) === owner.file));
    assert.ok(calls.some((a) => a.includes("rmdir") && a.at(-1) === owner.directory));
    assert.ok(!calls.some((a) => a.includes("-r") || a.includes("-rf")));
    assert.equal(existsSync(record), false);
  });
});
test("an existing remote directory is never adopted or deleted", async () => {
  await fixture(async (owned, record) => {
    const calls = [];
    await assert.rejects(
      seedAndroidImage({ deviceId: "emulator-5554" }, owned, {
        adb: "adb",
        record,
        execute: async (argv) => {
          calls.push(argv);
          return { code: argv.includes("mkdir") && !argv.includes("-p") ? 1 : 0, stdout: "" };
        },
      }),
      /claim/,
    );
    assert.ok(
      !calls.some(
        (a) =>
          a.includes("push") || a.includes("delete") || a.includes("rm") || a.includes("rmdir"),
      ),
    );
    assert.equal(existsSync(record), false);
  });
});
test("cleanup failure retains a bounded ownership record for the exact remote fixture", async () => {
  await fixture(async (owned, record) => {
    const stop = await seedAndroidImage({ deviceId: "emulator-5554" }, owned, {
      adb: "adb",
      record,
      execute: async (argv) => ({
        code: argv.includes("delete") ? 1 : 0,
        stdout: argv.includes("query") ? "Row: 0 _id=7, _size=11" : "",
      }),
    });
    await assert.rejects(stop(), /cleanup/);
    assert.equal(existsSync(record), true);
  });
});
