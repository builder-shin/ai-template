import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Redis } from "ioredis";
import { expect, it } from "vitest";
import { startProcessTree, stopProcessTree } from "../../scripts/process-tree.mjs";
import { scriptSettings } from "../../scripts/runtime.js";
import { environment } from "../../scripts/child-environment.mjs";
import { assertProjectDatabase } from "../../scripts/db/guard.js";
import { bindable, gone } from "../../scripts/tests/fixtures/process-probes.js";

it.skipIf(process.platform === "win32").each([
  { signal: "SIGINT", code: 130 },
  { signal: "SIGTERM", code: 143 },
] as const)(
  "CI 실제 e2e:serve는 $signal 뒤 $code 종료하며 개발 표식을 보존하고 네 그룹과 18000을 회수한다",
  async ({ signal, code }) => {
    const settings = scriptSettings();
    const marker = randomUUID();
    const table = `aitpl_task20_${marker.replaceAll("-", "")}`;
    const dir = await mkdtemp(join(tmpdir(), "aitpl-real-signals-"));
    const database = (name: string) => {
      const url = new URL(settings.DATABASE_URL);
      url.pathname = `/${name}`;
      return new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
    };
    const dbs = [database("app"), database("app_e2e")] as const;
    const cacheFor = (db: number) => {
      const url = new URL(settings.REDIS_URL);
      url.pathname = `/${String(db)}`;
      url.searchParams.delete("db");
      return new Redis(url.href, { lazyConnect: true, maxRetriesPerRequest: 1 });
    };
    const caches = [cacheFor(0), cacheFor(14)] as const;
    let child: ReturnType<typeof startProcessTree> | undefined;
    try {
      for (const [index, db] of dbs.entries()) {
        const url = new URL(settings.DATABASE_URL);
        url.pathname = index === 0 ? "/app" : "/app_e2e";
        await assertProjectDatabase(url.href);
        await db.connect();
        await db.query(`CREATE TABLE "${table}" (id text PRIMARY KEY)`);
        await db.query(`INSERT INTO "${table}"(id) VALUES($1)`, [marker]);
      }
      for (const cache of caches) await cache.set(`task20:${marker}`, "preserve");
      const running = startProcessTree(
        [
          "--import",
          "tsx",
          "scripts/e2e-serve.ts",
          "--",
          process.execPath,
          "-e",
          "setTimeout(()=>{},1e6)",
        ],
        {
          cwd: process.cwd(),
          env: { ...environment(), AITPL_READY_DIR: dir },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      child = running;
      const exited = once(running, "exit");
      let diagnostics = "";
      running.stdout?.on("data", (data: Buffer) => {
        diagnostics = (diagnostics + data.toString()).slice(-32768);
      });
      running.stderr?.on("data", (data: Buffer) => {
        diagnostics = (diagnostics + data.toString()).slice(-32768);
      });
      await expect
        .poll(
          async () => {
            if (running.exitCode !== null) throw new Error("실제 실행기가 준비 전에 끝났다");
            try {
              return JSON.parse(await readFile(join(dir, "command.json"), "utf8")) as unknown;
            } catch {
              return null;
            }
          },
          { timeout: 90000 },
        )
        .not.toBeNull();
      const pids = await Promise.all(
        ["api", "worker", "scheduler", "command"].map(
          async (role) =>
            (JSON.parse(await readFile(join(dir, `${role}.json`), "utf8")) as { pid: number }).pid,
        ),
      );
      expect(
        (await fetch("http://127.0.0.1:18000/health/ready", { signal: AbortSignal.timeout(5000) }))
          .status,
      ).toBe(200);
      const began = Date.now();
      child.kill(signal);
      expect((await exited)[0]).toBe(code);
      expect(Date.now() - began).toBeLessThan(20000);
      for (const pid of pids) {
        expect(gone(pid)).toBe(true);
        expect(gone(-pid)).toBe(true);
      }
      await bindable(18000);
      expect(
        (await dbs[0].query<{ id: string }>(`SELECT id FROM "${table}" WHERE id=$1`, [marker]))
          .rows,
      ).toEqual([{ id: marker }]);
      expect(
        (
          await dbs[1].query<{ name: string | null }>("SELECT to_regclass($1) AS name", [
            `public.${table}`,
          ])
        ).rows[0]?.name,
      ).toBeNull();
      expect(await caches[0].get(`task20:${marker}`)).toBe("preserve");
      expect(await caches[1].get(`task20:${marker}`)).toBeNull();
      for (const key of ["JWT_SECRET", "IDENTIFIER_HASH_SECRET", "SEED_ADMIN_PASSWORD"] as const)
        expect(diagnostics.includes(settings[key])).toBe(false);
    } finally {
      try {
        if (child) await stopProcessTree(child);
      } finally {
        try {
          await dbs[0].query(`DROP TABLE IF EXISTS "${table}"`);
        } finally {
          try {
            await Promise.all(dbs.map((db) => db.end()));
          } finally {
            try {
              await Promise.all(
                caches.map(async (cache) => {
                  try {
                    await cache.del(`task20:${marker}`);
                  } finally {
                    cache.disconnect();
                  }
                }),
              );
            } finally {
              await rm(dir, { recursive: true, force: true });
            }
          }
        }
      }
    }
  },
  150000,
);
