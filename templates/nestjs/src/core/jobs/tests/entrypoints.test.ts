import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as NestCore from "@nestjs/core";
import type * as SettingsModule from "../../config/settings.js";
import { JsonLogger } from "../../logging/json-logger.js";
import { JobsModule } from "../jobs.module.js";
import { MailModule } from "../../mail/mail.module.js";
import { WorkerHost } from "../worker-host.js";
import { SchedulerHost } from "../scheduler-host.js";
const state = vi.hoisted(
  (): {
    events: string[];
    failure: string;
    settings: { LOG_LEVEL: string };
    registration: object;
    registerArgs: unknown[];
    factoryArgs: unknown[];
    domainApp: unknown;
    hostTokens: unknown[];
    logLevel: unknown;
  } => ({
    events: [],
    failure: "",
    settings: { LOG_LEVEL: "info" },
    registration: {},
    registerArgs: [],
    factoryArgs: [],
    domainApp: undefined,
    hostTokens: [],
    logLevel: undefined,
  }),
);

function host(name: string) {
  return {
    start: () => {
      state.events.push(`${name}-start`);
      return Promise.resolve().then(() => {
        if (state.failure === "start") throw new Error("호스트 시작 실패");
        state.events.push(`${name}-ready`);
      });
    },
  };
}
const workerHost = host("worker");
const schedulerHost = host("scheduler");
const context = {
  enableShutdownHooks: () => {
    state.events.push("shutdown");
  },
  get: (token: unknown) => {
    state.hostTokens.push(token);
    if (token === WorkerHost) return workerHost;
    if (token === SchedulerHost) return schedulerHost;
    throw new Error("알 수 없는 호스트다");
  },
  close: () => {
    state.events.push("close");
    return Promise.resolve();
  },
};
vi.mock("@nestjs/core", async (importOriginal) => ({
  ...(await importOriginal<typeof NestCore>()),
  NestFactory: {
    createApplicationContext: (...args: unknown[]) => {
      state.factoryArgs = args;
      state.events.push("context");
      return Promise.resolve(context);
    },
  },
}));
vi.mock("../../config/settings.js", async (importOriginal) => ({
  ...(await importOriginal<typeof SettingsModule>()),
  loadSettings: () => state.settings,
}));
vi.mock("../../../app.module.js", () => ({
  AppModule: {
    register: (...args: unknown[]) => {
      state.registerArgs = args;
      return state.registration;
    },
    registerDomain: (app: unknown) => {
      state.domainApp = app;
      state.events.push("domain");
      if (state.failure === "domain") throw new Error("도메인 등록 실패");
    },
  },
  logLevels: (level: unknown) => {
    state.logLevel = level;
    return ["error"];
  },
}));
import { worker } from "../../../worker.js";
import { scheduler } from "../../../scheduler.js";
const wrappers = [
  ["worker", worker, WorkerHost, [JobsModule, MailModule]],
  ["scheduler", scheduler, SchedulerHost, [JobsModule]],
] as const;
const originalClose = context.close;
afterEach(async () => {
  await context.close();
});
beforeEach(() => {
  context.close = originalClose;
  state.events.length = 0;
  state.failure = "";
  state.registerArgs = [];
  state.factoryArgs = [];
  state.hostTokens = [];
  state.domainApp = undefined;
  state.logLevel = undefined;
});
it.each(wrappers)(
  "%s는 정확한 모듈과 호스트와 인프라를 등록하고 준비를 기다린다",
  async (name, start, Host, imports) => {
    expect(await start()).toBe(context);
    const [settings, logger, overrides, infrastructure] = state.registerArgs;
    expect(settings).toBe(state.settings);
    expect(logger).toBeInstanceOf(JsonLogger);
    expect(overrides).toEqual({ imports: [...imports], providers: [Host] });
    expect(infrastructure).toBe(true);
    expect(state.factoryArgs).toEqual([state.registration, { logger, abortOnError: false }]);
    expect(state.logLevel).toBe("info");
    expect(state.domainApp).toBe(context);
    expect(state.hostTokens).toEqual([Host]);
    expect(state.events).toEqual(["context", "domain", `${name}-start`, `${name}-ready`]);
  },
);
it.each(wrappers)(
  "%s의 비동기 시작 실패는 컨텍스트를 닫고 호출자에게 전한다",
  async (name, start, Host) => {
    state.failure = "start";
    await expect(start()).rejects.toThrow("호스트 시작 실패");
    expect(state.hostTokens).toEqual([Host]);
    expect(state.events).toEqual(["context", "domain", `${name}-start`, "close"]);
  },
);
it.each(wrappers)(
  "%s의 도메인 등록 실패는 호스트를 시작하지 않고 컨텍스트를 닫는다",
  async (_name, start) => {
    state.failure = "domain";
    await expect(start()).rejects.toThrow("도메인 등록 실패");
    expect(state.hostTokens).toEqual([]);
    expect(state.events).toEqual(["context", "domain", "close"]);
  },
);
