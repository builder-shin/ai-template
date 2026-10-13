import "reflect-metadata";
import { readFileSync } from "node:fs";
import type { DynamicModule, Type } from "@nestjs/common";
import { afterEach, expect } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { loadSettings } from "../../config/settings.js";
import { createApp, type AppOverrides } from "../create-app.js";

export const mediaType = "application/vnd.api+json";
const env = Object.fromEntries(
  readFileSync(new URL("../../../../.env.example", import.meta.url), "utf8")
    .split("\n")
    .flatMap((line) => {
      const match = /^([A-Z][A-Z0-9_]*)=(.*?)(?:\s+#.*)?$/.exec(line);
      return match ? [[match[1] as string, match[2]]] : [];
    }),
);
export const settings = loadSettings({ ...env, APP_ENV: "test", LOG_LEVEL: "error" });
const apps: NestExpressApplication[] = [];
afterEach(async () => {
  await Promise.all(
    apps.splice(0).map(async (app) => {
      const server = app.getHttpServer();
      await app.close();
      expect(server.listening).toBe(false);
      expect(server.address()).toBeNull();
    }),
  );
});
export async function testApp(
  imports: readonly (Type<unknown> | DynamicModule)[],
  overrides: AppOverrides = {},
) {
  const app = await createApp({ settings, imports, ...overrides }, false);
  apps.push(app);
  await app.listen(0, "127.0.0.1");
  return { app, http: request(app.getHttpServer()) };
}
export interface ErrorDocument {
  errors: {
    status: string;
    code: string;
    title: string;
    detail?: string;
    source?: Record<string, string>;
    meta: { traceId: string; params?: unknown };
  }[];
  meta: { traceId: string };
}
export function errorDocument(text: string): ErrorDocument {
  return JSON.parse(text) as ErrorDocument;
}

/** send의 JSON 변환과 자동 Content-Length 없이 실제 입력 바이트를 보낸다. */
export function sendRaw(test: request.Test, buffer: Buffer): Promise<request.Response> {
  test.write(buffer);
  return new Promise((resolve, reject) => {
    test.end((error: Error | null, response: request.Response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}
