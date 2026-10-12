import request from "supertest";
import { expect, it } from "vitest";
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
  expect(loadSettings({})).toMatchObject({ NODE_ENV: "development", PORT: 8000 });
  expect(loadSettings({ PORT: "8080", NODE_ENV: "test" }).PORT).toBe(8080);
  expect(() =>
    loadSettings({ PORT: "private-invalid-value", NODE_ENV: "private-invalid-mode" }),
  ).toThrow(/^Invalid environment variables: NODE_ENV, PORT$/);
});

it("keeps the eight registered permission values and descriptions", () => {
  const registry = new PermissionRegistry();
  expect(registry.list()).toHaveLength(8);
  expect(
    registry.list().every((item) => item.description && item.group === item.code.split(":")[0]),
  ).toBe(true);
  expect(registry.has("unknown:permission")).toBe(false);
});

it("rejects constrained surrogate registration before any database operation", async () => {
  const app = await createApp();
  app.useLogger(false);
  try {
    await app.init();
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/api/v1/registrations")
      .set("Content-Type", "application/vnd.api+json")
      .send({
        data: {
          type: "registrations",
          attributes: { email: "a@example.com", password: "horse\ud800-secret", name: "Alice" }, // betterleaks:allow - public local example or test credential
        },
      });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      errors: [
        { code: "validation.invalid_format", source: { pointer: "/data/attributes/password" } },
      ],
    });
  } finally {
    await app.close();
  }
});
