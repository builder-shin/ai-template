import request from "supertest";
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createApp } from "../src/main.js";
import { loadSettings } from "../src/core/config/settings.js";
import { PermissionRegistry } from "../src/modules/roles/index.js";

it("returns liveness without listening or requiring infrastructure", async () => {
  const app = await createApp();
  app.useLogger(false);
  try {
    await app.init();
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/health/live")
      .expect("Content-Type", /application\/json/)
      .expect(200, { status: "ok", checks: {} });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/health/live/")
      .expect(404);
  } finally {
    await app.close();
  }
});

it("reports only invalid environment names, never supplied values", () => {
  expect(loadSettings({})).toEqual({ NODE_ENV: "development", PORT: 8000 });
  expect(loadSettings({ PORT: "8080", NODE_ENV: "test" }).PORT).toBe(8080);
  expect(() =>
    loadSettings({ PORT: "private-invalid-value", NODE_ENV: "private-invalid-mode" }),
  ).toThrow(/^Invalid environment variables: NODE_ENV, PORT$/);
});

it("keeps the permission registry aligned with the contract rather than a second copied list", () => {
  const source = readFileSync(
    new URL("../../../contract/typespec/src/resources/roles.tsp", import.meta.url),
    "utf8",
  );
  const codes = [
    ...(/union PermissionCode \{([^}]+)\}/.exec(source)?.[1] ?? "").matchAll(/"([^"]+)"/g),
  ]
    .map((match) => match[1])
    .sort();
  const registry = new PermissionRegistry();
  expect(registry.list().map((item) => item.code)).toEqual(codes);
  expect(
    registry.list().every((item) => item.description && item.group === item.code.split(":")[0]),
  ).toBe(true);
  expect(registry.has("unknown:permission")).toBe(false);
});
