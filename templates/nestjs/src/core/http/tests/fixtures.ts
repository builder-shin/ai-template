import "reflect-metadata";
import { SetMetadata, type DynamicModule, type Type } from "@nestjs/common";
import { OPERATION_METADATA } from "../../jsonapi/decorators.js";
import { afterEach, expect } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { loadSettings } from "../../config/settings.js";
import { exampleEnv } from "../../config/tests/env-example.js";
import { createApp, type AppOverrides } from "../create-app.js";

export const mediaType = "application/vnd.api+json";
/** raw Nest 라우터·파이프라인 시험 처리기의 공개 인증 의도를 명시한다. */
export function publicFixtureOperation(): MethodDecorator {
  return SetMetadata(OPERATION_METADATA, { auth: "none" });
}
const env = exampleEnv();
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
    meta?: { params?: unknown };
  }[];
  meta: { traceId: string };
}
export function errorDocument(text: string): ErrorDocument {
  return JSON.parse(text) as ErrorDocument;
}

/** 큰 본문의 조기 응답을 잃지 않게 같은 바이트를 보내고 서버의 drain 동안 연결을 유지한다. */
export function sendBytes(test: request.Test, body: string): request.Test {
  return test.set("Connection", "keep-alive").send(Buffer.from(body));
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
