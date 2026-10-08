import type { TestProject } from "vitest/node";
import { startMock } from "./mock-server";

declare module "vitest" {
  export interface ProvidedContext {
    mockBaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const mock = await startMock({
    env: (base) => ({
      FRONTEND_URL: base,
      RATE_LIMIT_GLOBAL: "10000",
      RATE_LIMIT_LOGIN_IP: "1000",
      RATE_LIMIT_LOGIN_IDENTIFIER: "1000",
      RATE_LIMIT_REGISTRATION_IP: "1000",
      RATE_LIMIT_MAIL_IP: "1000",
    }),
  });
  project.provide("mockBaseUrl", mock.base);
  return mock.stop;
}
