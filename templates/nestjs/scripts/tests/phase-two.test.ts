import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { expect, it } from "vitest";
import { startProcessTree, stopProcessTree } from "../process-tree.mjs";
import { environment } from "../child-environment.mjs";
import { runSignalTests } from "../test-e2e.js";
import { gone } from "./fixtures/process-probes.js";

it.skipIf(process.platform === "win32").each([
  { signal: "SIGINT", code: 130 },
  { signal: "SIGTERM", code: 143 },
] as const)(
  "POSIX 2단계 $signal 뒤 소유 자손·그룹을 회수하고 처리기를 제거한 뒤 $code 코드로 끝난다",
  async ({ signal, code }) => {
    const dir = await mkdtemp(join(tmpdir(), "aitpl-phase-two-"));
    const record = join(dir, "owned.json");
    const driver = startProcessTree(
      ["--import", "tsx", resolve("scripts/tests/fixtures/phase-two-driver.ts"), record],
      { env: environment(), stdio: "ignore" },
    );
    const exited = once(driver, "exit");
    let owned: { pid: number; descendant: number } | undefined;
    try {
      await expect
        .poll(
          async () => {
            try {
              owned = JSON.parse(await readFile(record, "utf8")) as typeof owned;
              return Boolean(owned);
            } catch {
              return false;
            }
          },
          { timeout: 10000 },
        )
        .toBe(true);
      driver.kill(signal);
      expect((await exited)[0]).toBe(code);
      if (!owned) throw new Error("소유 기록이 없다");
      expect(gone(owned.pid)).toBe(true);
      expect(gone(-owned.pid)).toBe(true);
      expect(gone(owned.descendant)).toBe(true);
      const result = JSON.parse(await readFile(record + "-result", "utf8")) as {
        code: number;
        before: number[];
        after: number[];
      };
      expect(result.code).toBe(code);
      expect(result.after).toEqual(result.before);
    } finally {
      if (owned && !gone(-owned.pid)) {
        const pid = owned.pid;
        process.kill(-pid, "SIGTERM");
        await expect.poll(() => gone(-pid), { timeout: 3000 }).toBe(true);
      }
      await stopProcessTree(driver);
      await rm(dir, { recursive: true, force: true });
    }
  },
  20000,
);
it("2단계 정상 자식의 종료 코드 23을 보존하고 처리기를 남기지 않는다", async () => {
  const before = ["SIGINT", "SIGTERM"].map((signal) => process.listenerCount(signal));
  expect(await runSignalTests(["-e", "process.exit(23)"])).toBe(23);
  expect(["SIGINT", "SIGTERM"].map((signal) => process.listenerCount(signal))).toEqual(before);
});
