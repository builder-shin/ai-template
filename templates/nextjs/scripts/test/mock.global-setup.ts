import type { TestProject } from "vitest/node";
import { reserveHttpBase, startHttpServer } from "../http/server";
import { startHeaderFailureBackend } from "./header-failure-backend";
import { requireChromium } from "./browser";
import { startDeletionMock, startMock } from "./mock-server";

declare module "vitest" {
  export interface ProvidedContext {
    mockBaseUrl: string;
    httpBaseUrl: string;
    deletionMockBaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  requireChromium();
  const httpBase = await reserveHttpBase();
  const stops: (() => Promise<void>)[] = [];
  async function stop() {
    // 나중에 만든 자원부터 정리하고 실패해도 나머지를 모두 종료한다.
    const errors: unknown[] = [];
    for (const cleanup of stops.reverse()) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "테스트 서버 종료 실패");
  }
  try {
    const mock = await startMock({
      env: (base) => ({
        FRONTEND_URL: base,
        OAUTH_REDIRECT_URIS: `${httpBase}/oauth/callback`,
        REALTIME_ALLOWED_ORIGINS: httpBase,
        RATE_LIMIT_GLOBAL: "10000",
        RATE_LIMIT_LOGIN_IP: "1000",
        RATE_LIMIT_LOGIN_IDENTIFIER: "1000",
        RATE_LIMIT_REGISTRATION_IP: "1000",
        RATE_LIMIT_MAIL_IP: "1000",
        RATE_LIMIT_MAIL_EMAIL: "3",
      }),
    });
    stops.push(mock.stop);
    project.provide("mockBaseUrl", mock.base);
    const deletionMock = await startDeletionMock();
    stops.push(deletionMock.stop);
    project.provide("deletionMockBaseUrl", deletionMock.base);
    const backend = await startHeaderFailureBackend(mock.base);
    stops.push(backend.stop);
    const http = await startHttpServer(backend.base, httpBase, mock.base);
    stops.push(http.stop);
    project.provide("httpBaseUrl", http.base);
    return stop;
  } catch (error) {
    await stop();
    throw error;
  }
}
