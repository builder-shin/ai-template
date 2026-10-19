import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadSettings, type Settings } from "../../src/core/config/settings.js";
import { exampleEnv } from "../../src/core/config/tests/env-example.js";
import type * as Runtime from "../runtime.js";
import type * as HttpModule from "../../src/core/http/create-app.js";
import type * as FsPromises from "node:fs/promises";
import type { JsonLogger as JsonLoggerInstance } from "../../src/core/logging/json-logger.js";

const state = vi.hoisted(() => ({
  generated: false,
  failPrisma: false,
  failWrite: false,
  emitError: false,
  events: [] as string[],
  output: "",
  settings: undefined as Settings | undefined,
  apps: [] as NestExpressApplication[],
  infrastructure: undefined as boolean | undefined,
}));
function installMocks() {
  vi.doMock("../../src/generated/prisma/client.js", async (importOriginal) => {
    if (!state.generated) throw new Error("생성 Prisma 클라이언트가 없다");
    return importOriginal();
  });
  vi.doMock("../runtime.js", async (importOriginal) => {
    const actual = await importOriginal<typeof Runtime>();
    return {
      ...actual,
      scriptSettings: () => {
        if (!state.settings) throw new Error("설정 fixture가 없다");
        return state.settings;
      },
      prismaCommand: () => {
        state.events.push("Prisma 생성");
        if (state.failPrisma) throw new Error("Prisma 생성 실패");
        state.generated = true;
      },
    };
  });
  vi.doMock("../../src/core/http/create-app.js", async (importOriginal) => {
    state.events.push("앱 import");
    if (!state.generated) throw new Error("생성 Prisma 클라이언트가 없다");
    const actual = await importOriginal<typeof HttpModule>();
    const { JsonLogger } = await import("../../src/core/logging/json-logger.js");
    return {
      ...actual,
      createApp: async (...args: Parameters<typeof actual.createApp>) => {
        state.events.push("앱 초기화");
        state.infrastructure = args[1];
        const app = await actual.createApp(...args);
        state.apps.push(app);
        if (state.emitError) {
          app.get<JsonLoggerInstance>(JsonLogger).error(new Error("생성 진단"));
        }
        return new Proxy(app, {
          get(target, key, receiver) {
            if (key === "close")
              return async () => {
                await target.close();
                state.events.push("앱 닫음");
              };
            return Reflect.get(target, key, receiver) as unknown;
          },
        });
      },
    };
  });
  vi.doMock("node:fs/promises", async (importOriginal) => {
    const actual = await importOriginal<typeof FsPromises>();
    return {
      ...actual,
      writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
        const [path, data] = args;
        if (path !== "openapi.json") return actual.writeFile(...args);
        if (state.failWrite) throw new Error("생성 파일 쓰기 실패");
        if (typeof data !== "string") throw new Error("문서 문자열이 아니다");
        state.output = data;
      },
    };
  });
}
const env = exampleEnv();
beforeEach(() => {
  vi.resetModules();
  state.generated = false;
  state.failPrisma = false;
  state.failWrite = false;
  state.emitError = false;
  state.events = [];
  state.output = "";
  state.apps = [];
  state.infrastructure = undefined;
  state.settings = loadSettings({ ...env, APP_ENV: "test", LOG_LEVEL: "info" });
  installMocks();
});
afterEach(async () => {
  for (const app of state.apps) {
    await app.close();
    const server = app.getHttpServer();
    expect(server.listening).toBe(false);
    expect(server.address()).toBeNull();
  }
  vi.restoreAllMocks();
});
const document = () =>
  JSON.parse(state.output) as {
    components: { schemas: Record<string, { enum?: unknown[] }> };
  };
function capture(stream: NodeJS.WriteStream): string[] {
  const chunks: string[] = [];
  vi.spyOn(stream, "write").mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(chunk.toString());
    return true;
  });
  return chunks;
}
it("생성 클라이언트가 없어도 문서 포맷 기능을 가져와 사용할 수 있다", async () => {
  const { updateOpenApi } = await import("../gen.js");
  await updateOpenApi({ openapi: "3.1.0" }, "openapi.json", false);
  expect(JSON.parse(state.output) as unknown).toEqual({ openapi: "3.1.0" });
  expect(state.events).toEqual([]);
});
it("Prisma 생성이 끝난 뒤 앱을 가져와 실제 오류와 권한 enum을 문서에 등록한다", async () => {
  const { generate } = await import("../gen.js");
  await generate();
  expect(state.events).toEqual(["Prisma 생성", "앱 import", "앱 초기화", "앱 닫음"]);
  expect(state.infrastructure).toBe(false);
  const schemas = document().components.schemas;
  expect(schemas.ErrorCode?.enum).toEqual(
    expect.arrayContaining([
      "jsonapi.invalid_document",
      "validation.invalid_format",
      "service.unavailable",
    ]),
  );
  expect(schemas.PermissionCode?.enum).toEqual([
    "admin:access",
    "users:read",
    "users:manage",
    "roles:read",
    "roles:manage",
    "audit-logs:read",
    "posts:create",
    "posts:manage",
  ]);
});
it("Prisma 생성에 실패하면 앱 그래프를 가져오거나 문서를 쓰지 않는다", async () => {
  state.failPrisma = true;
  const { generate } = await import("../gen.js");
  await expect(generate()).rejects.toThrow("Prisma 생성 실패");
  expect(state.events).toEqual(["Prisma 생성"]);
  expect(state.output).toBe("");
});
it("생성 중 부트스트랩 정보 로그를 내지 않고 원래 설정을 보존한다", async () => {
  state.generated = true;
  const output = capture(process.stdout);
  const { generate } = await import("../gen.js");
  await generate();
  expect(output).toEqual([]);
  expect(state.settings?.LOG_LEVEL).toBe("info");
});
it("생성 중 오류 로그는 유지한다", async () => {
  state.generated = true;
  state.emitError = true;
  const errors = capture(process.stderr);
  const { generate } = await import("../gen.js");
  await generate();
  expect(errors).toHaveLength(1);
  expect(JSON.parse(errors[0] ?? "{}") as unknown).toMatchObject({ level: "error" });
  expect(errors[0]).toContain("생성 진단");
});
it("문서 쓰기에 실패해도 초기화한 앱을 닫는다", async () => {
  state.generated = true;
  state.failWrite = true;
  const { generate } = await import("../gen.js");
  await expect(generate()).rejects.toThrow("생성 파일 쓰기 실패");
  expect(state.events.at(-1)).toBe("앱 닫음");
});
