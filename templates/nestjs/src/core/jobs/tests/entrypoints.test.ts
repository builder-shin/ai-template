import { beforeEach, expect, it, vi } from "vitest";
import type * as NestCore from "@nestjs/core";
import type * as SettingsModule from "../../config/settings.js";
const state = vi.hoisted(() => ({ events: [] as string[], failure: false }));
const host = {
  start: () => {
    state.events.push("start");
    if (state.failure) throw new Error("호스트 시작 실패");
  },
};
const context = {
  enableShutdownHooks: () => {
    state.events.push("shutdown");
  },
  get: () => host,
  close: () => {
    state.events.push("close");
    return Promise.resolve();
  },
};
vi.mock("@nestjs/core", async (importOriginal) => ({
  ...(await importOriginal<typeof NestCore>()),
  NestFactory: {
    createApplicationContext: () => {
      state.events.push("context");
      return Promise.resolve(context);
    },
  },
}));
vi.mock("../../config/settings.js", async (importOriginal) => ({
  ...(await importOriginal<typeof SettingsModule>()),
  loadSettings: () => ({ LOG_LEVEL: "info" }),
}));
vi.mock("../../../app.module.js", () => ({
  AppModule: {
    register: () => ({}),
    registerDomain: () => {
      state.events.push("domain");
    },
  },
  logLevels: () => ["error"],
}));
import { worker } from "../../../worker.js";
import { scheduler } from "../../../scheduler.js";
beforeEach(() => {
  state.events.length = 0;
  state.failure = false;
});
it.each([
  ["worker", worker],
  ["scheduler", scheduler],
] as const)(
  "%s는 컨텍스트와 종료 hook을 만들고 도메인을 등록한 뒤 호스트를 시작한다",
  async (_name, start) => {
    expect(await start()).toBe(context);
    expect(state.events).toEqual(["context", "shutdown", "domain", "start"]);
  },
);
it.each([
  ["worker", worker],
  ["scheduler", scheduler],
] as const)("%s 시작 실패는 컨텍스트를 닫고 호출자에게 전한다", async (_name, start) => {
  state.failure = true;
  await expect(start()).rejects.toThrow("호스트 시작 실패");
  expect(state.events).toEqual(["context", "shutdown", "domain", "start", "close"]);
});
