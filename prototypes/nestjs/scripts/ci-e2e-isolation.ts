import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Pool } from "pg";
import { Redis } from "ioredis";
import { loadSettings } from "../src/core/config/settings.js";
import { guardDatabase, assertOwnedPostgres } from "./db-guard.js";
import { e2eEnvironment } from "./e2e-options.js";
import { resolve } from "node:path";

// CI only. setup must have created the owned app/app_e2e databases first.
const settings = loadSettings(process.env);
assertOwnedPostgres(settings.DATABASE_URL);
assert.equal(new URL(settings.DATABASE_URL).pathname, "/app");
assert.equal(new URL(settings.REDIS_URL).pathname, "/0");
const e2e = e2eEnvironment("http://localhost:3000", process.env).server;
await guardDatabase(settings.DATABASE_URL);
await guardDatabase(e2e.DATABASE_URL ?? "");
const dev = new Pool({ connectionString: settings.DATABASE_URL, connectionTimeoutMillis: 5000 });
const test = new Pool({ connectionString: e2e.DATABASE_URL, connectionTimeoutMillis: 5000 });
const redis0 = new Redis(settings.REDIS_URL),
  redis14 = new Redis(e2e.REDIS_URL ?? "");
const root = resolve(import.meta.dirname, "..");
const state = resolve(root, ".cache/e2e/marker-state.json");
const mode = process.argv[2];
assert(["before", "after"].includes(mode ?? ""));
const id =
  mode === "before" ? randomUUID() : (JSON.parse(readFileSync(state, "utf8")) as { id: string }).id;
const key = `aitpl-nestjs-proto-marker:${id}`;
try {
  if (mode === "before") {
    for (const db of [dev, test])
      await db.query("INSERT INTO roles(id,name,description) VALUES ($1,$2,$3)", [id, id, key]);
    await redis0.set(key, id);
    await redis14.set(key, id);
    mkdirSync(resolve(root, ".cache/e2e"), { recursive: true });
    writeFileSync(state, JSON.stringify({ id, beforeUtc: new Date().toISOString() }));
    console.log("Owned app/app_e2e and Redis0/14 markers inserted.");
  } else {
    const beforeCleanup = {
      appMarker:
        (
          await dev.query<{ description: string }>("SELECT description FROM roles WHERE id=$1", [
            id,
          ])
        ).rows[0]?.description === key,
      redis0Marker: (await redis0.get(key)) === id,
      e2eMarkerCleared: (await test.query("SELECT id FROM roles WHERE id=$1", [id])).rowCount === 0,
      redis14MarkerCleared: (await redis14.get(key)) === null,
    };
    const portClosed = await new Promise<boolean>((done) => {
      const socket = createConnection({ host: "127.0.0.1", port: 18000 });
      socket.once("connect", () => {
        socket.destroy();
        done(false);
      });
      socket.once("error", (error: NodeJS.ErrnoException) => {
        done(error.code === "ECONNREFUSED");
      });
    });
    const processes: unknown = JSON.parse(
      readFileSync(resolve(root, ".cache/e2e/processes.json"), "utf8"),
    );
    const evidence = {
      observedAt: new Date().toISOString(),
      ...beforeCleanup,
      portClosed,
      processes,
    };
    mkdirSync(resolve(root, ".cache/e2e"), { recursive: true });
    writeFileSync(resolve(root, ".cache/e2e/isolation.json"), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ e2eIsolation: evidence }));
    assert(Object.values(beforeCleanup).every(Boolean));
    assert(portClosed);
  }
} finally {
  if (mode === "after") {
    // Remove only the markers created here; failed preservation stays in the evidence.
    await dev.query("DELETE FROM roles WHERE id=$1", [id]);
    await test.query("DELETE FROM roles WHERE id=$1", [id]);
    await redis0.del(key);
    await redis14.del(key);
  }
  redis0.disconnect();
  redis14.disconnect();
  await dev.end();
  await test.end();
}
