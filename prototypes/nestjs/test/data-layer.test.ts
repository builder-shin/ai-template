import { expect, it, vi } from "vitest";
import { PrismaService } from "../src/core/db/prisma.service.js";
import { loadSettings } from "../src/core/config/settings.js";
import { UnitOfWork } from "../src/core/db/unit-of-work.js";
import type { Tx } from "../src/core/db/unit-of-work.js";
import { assertLocalDatabase, assertTestDatabase, inspectTables } from "../scripts/db-guard.js";
import { renderVerification } from "../src/core/mail/templates.js";
import { resolve } from "node:path";
it("imports the generated ESM client and disconnects without opening a database connection", async () => {
  const client = new PrismaService(loadSettings({}));
  expect(client.user).toBeDefined();
  await client.onModuleDestroy();
});
it("runs hooks after resolved commit, discards rollback hooks and contains hook failures (unit double)", async () => {
  const order: string[] = [],
    options: unknown[] = [],
    tx = {} as Tx;
  const transaction = vi.fn(
    async (fn: (tx: Tx) => Promise<unknown>, _options?: { timeout?: number; maxWait?: number }) => {
      options.push(_options);
      const result = await fn(tx);
      order.push("commit");
      return result;
    },
  );
  const uow = new UnitOfWork({ $transaction: transaction } as unknown as PrismaService);
  const value = await uow.run(
    async (_tx, afterCommit) => {
      afterCommit(() => {
        order.push("hook");
      });
      afterCommit(() => {
        throw new Error("delivery failure");
      });
      afterCommit(() => {
        order.push("later-hook");
      });
      return Promise.resolve(7);
    },
    { timeout: 1000, maxWait: 1000 },
  );
  expect(value).toBe(7);
  expect(order).toEqual(["commit", "hook", "later-hook"]);
  expect(options[0]).toEqual({ timeout: 1000, maxWait: 1000 });
  await expect(
    uow.run((_tx, afterCommit) => {
      afterCommit(() => {
        order.push("rollback-hook");
      });
      return Promise.reject(new Error("rollback"));
    }),
  ).rejects.toThrow("rollback");
  expect(order).not.toContain("rollback-hook");
});
it.each(["database.example.com", "::1", "127.0.0.2", "localhost.example.com"])(
  "rejects remote reset host %s",
  (host) => {
    expect(() => {
      assertLocalDatabase(
        `postgresql://app:app@${host.includes(":") ? `[${host}]` : host}:5432/app`,
      );
    }).toThrow();
  },
);
it.each(["localhost", "127.0.0.1"])("allows reset host %s", (host) => {
  expect(() => {
    assertLocalDatabase(`postgresql://app:app@${host}:25432/app`);
  }).not.toThrow();
});
it("rejects foreign tables and mixed migrations, and confines test targets", () => {
  expect(() => {
    inspectTables([]);
  }).not.toThrow();
  expect(() => {
    inspectTables(["_prisma_migrations", "users"]);
  }).not.toThrow();
  expect(() => {
    inspectTables(["users"]);
  }).toThrow();
  expect(() => {
    inspectTables(["_prisma_migrations", "alembic_version"]);
  }).toThrow();
  expect(() => {
    assertTestDatabase("postgresql://app:app@127.0.0.1/app", "redis://127.0.0.1/15"); // betterleaks:allow - public local example or test credential
  }).toThrow();
  expect(() => {
    assertTestDatabase("postgresql://app:app@127.0.0.1/app_test", "redis://127.0.0.1/0"); // betterleaks:allow - public local example or test credential
  }).toThrow();
});
it.each(["ko", "en"])("renders %s templates with HTML escaping", (locale) => {
  const mail = renderVerification(
    resolve(import.meta.dirname, "../src/modules/auth/templates"),
    locale,
    "a@example.com",
    { name: "<Alice>", link: "http://localhost/verify?token=a&b=c" },
  );
  expect(mail.subject).toBeTruthy();
  expect(mail.text).toContain("<Alice>");
  expect(mail.html).toContain("&lt;Alice&gt;");
  expect(mail.html).toContain("a&amp;b=c");
});
