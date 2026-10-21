import { test, expect } from "vitest";
import {
  createOwnedMobileProject,
  removeOwnedMobileProject,
  readOwnedMobileProject,
} from "../../src/mobile-e2e/owned.ts";
import {
  mkdtempSync,
  existsSync,
  writeFileSync,
  rmSync,
  readFileSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.each(["fastapi", "nestjs"] as const)(
  "%s generated cleanup preserves a pending device-media ownership record before deleting any file",
  (backend) => {
    const cache = mkdtempSync(join(tmpdir(), "aitpl-media-owner-test-"));
    const owned = createOwnedMobileProject(backend, "pending-media", cache);
    const record = join(
      owned.project,
      "apps/mobile/artifacts/native/another-run/android/android-media.json",
    );
    try {
      mkdirSync(join(record, ".."), { recursive: true });
      writeFileSync(record, JSON.stringify({ claimed: true, device: "emulator-5554" }));
      expect(() => {
        removeOwnedMobileProject(owned);
      }).toThrow(/media.*record/i);
      expect(readOwnedMobileProject(backend, "pending-media", cache)).toEqual(owned);
      expect(existsSync(record)).toBe(true);
      expect(existsSync(owned.marker)).toBe(true);
      unlinkSync(record);
      removeOwnedMobileProject(owned);
      expect(existsSync(owned.parent)).toBe(false);
    } finally {
      if (existsSync(record)) unlinkSync(record);
      if (existsSync(owned.parent)) removeOwnedMobileProject(owned);
      rmSync(cache, { recursive: true, force: true });
    }
  },
);
test("generated native projects persist exact ownership and refuse tampered cleanup", () => {
  const cache = mkdtempSync(join(tmpdir(), "aitpl-mobile-owner-test-"));
  let owned: ReturnType<typeof createOwnedMobileProject> | undefined;
  try {
    owned = createOwnedMobileProject("fastapi", "owner-test", cache);
    const created = owned;
    const original = readFileSync(owned.marker, "utf8");
    expect(readOwnedMobileProject("fastapi", "owner-test", cache)).toEqual(owned);
    expect(() => createOwnedMobileProject("fastapi", "owner-test", cache)).toThrow(/existing/i);
    writeFileSync(owned.marker, JSON.stringify({ ...owned, nonce: "changed" }));
    expect(() => {
      removeOwnedMobileProject(created);
    }).toThrow(/ownership/i);
    expect(existsSync(owned.parent)).toBe(true);
    writeFileSync(owned.marker, original);
    removeOwnedMobileProject(owned);
    expect(existsSync(owned.parent)).toBe(false);
    expect(readOwnedMobileProject("fastapi", "owner-test", cache)).toBeUndefined();
    owned = undefined;
  } finally {
    if (owned) removeOwnedMobileProject(owned);
    rmSync(cache, { recursive: true, force: true });
  }
});
