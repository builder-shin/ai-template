import { mkdirSync, writeFileSync } from "node:fs";
import request from "supertest";
import { expect, it } from "vitest";
import { createApp } from "../src/main.js";
import { listenTestServer } from "../tests/http-server.js";
it("owns Nest loopback startup/close under 10 and 20 concurrent real Supertest HTTP requests without startup amplification", async () => {
  const app = await createApp();
  app.useLogger(false);
  const warnings: string[] = [];
  const warning = (value: Error) => {
    if (value.name === "MaxListenersExceededWarning") warnings.push(value.message);
  };
  process.on("warning", warning);
  const server = await listenTestServer(app);
  const counts = () =>
    Object.fromEntries(
      ["listening", "error", "close"].map((event) => [event, server.listenerCount(event)]),
    );
  const baseline = counts(),
    batches: object[] = [];
  const max = server.getMaxListeners();
  try {
    for (const concurrency of [10, 20]) {
      const peak = { ...baseline };
      const observed = (event: string | symbol) => {
        if (typeof event === "string" && event in peak)
          peak[event] = Math.max(peak[event] ?? 0, server.listenerCount(event) + 1);
      };
      server.on("newListener", observed);
      const results = await Promise.all(
        Array.from({ length: concurrency }, () => request(server).get("/health/live")),
      );
      server.off("newListener", observed);
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(server.listening).toBe(true);
      expect(counts()).toEqual(baseline);
      expect(peak).toEqual(baseline);
      batches.push({ concurrency, statuses: results.map((r) => r.status), peak, after: counts() });
    }
    expect(server.getMaxListeners()).toBe(max);
    expect(max).toBe(10);
    expect(warnings).toEqual([]);
  } finally {
    await app.close();
    process.off("warning", warning);
  }
  expect(server.listening).toBe(false);
  mkdirSync(".cache/lifecycle", { recursive: true });
  writeFileSync(
    ".cache/lifecycle/nest-supertest.json",
    JSON.stringify(
      {
        scope:
          "Actual installed Nest12.1.2/Supertest7.3.1/loopback HTTP; no DB/auth/storage acceptance",
        maxListeners: max,
        baseline,
        batches,
        warnings,
        explicitlyClosed: !server.listening,
      },
      null,
      2,
    ),
  );
});
