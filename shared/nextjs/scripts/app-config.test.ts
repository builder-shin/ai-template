import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { appConfig, parseAppConfig } from "../src/lib/app-config.mjs";
import config from "../app.config.json";

let temporary: string | undefined;
afterEach(() => {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
  temporary = undefined;
});
const ports = { dev: 3000, mock: 4010, e2e: 3100, e2eMock: 4110 };

describe("앱 설정", () => {
  it("앱의 JSON 설정을 TypeScript에서 읽는다", () => {
    expect(appConfig).toEqual(config);
  });
  it.each(["", "Web", "admin_app", "-admin", "admin--app", "admin-", 1])(
    "잘못된 앱 이름 %j를 거절한다",
    (app) => {
      expect(() => parseAppConfig({ app, ports })).toThrow(/app\.config\.json.*—.*kebab-case/);
    },
  );
  it.each([1023, 65536, 3000.5, "3000", null, 4010])(
    "잘못되거나 중복된 포트 %j를 거절한다",
    (dev) => {
      expect(() => parseAppConfig({ app: "web", ports: { ...ports, dev } })).toThrow(
        /app\.config\.json.*—.*1024.*65535.*서로 다른/,
      );
    },
  );
  it.each([null, [], {}, { app: "web" }, { app: "web", ports: {} }])(
    "불완전한 설정 %j를 거절한다",
    (value) => {
      expect(() => parseAppConfig(value)).toThrow(/app\.config\.json.*—/);
    },
  );
  it("plain node는 별도 앱의 설정으로 포트·모드·쿠키 이름을 계산한다", () => {
    temporary = mkdtempSync(join(tmpdir(), "aitpl-app-config-"));
    mkdirSync(join(temporary, "src/lib"), { recursive: true });
    mkdirSync(join(temporary, "scripts"));
    copyFileSync(
      new URL("../src/lib/app-config.mjs", import.meta.url),
      join(temporary, "src/lib/app-config.mjs"),
    );
    copyFileSync(
      new URL("./dev-mode.mjs", import.meta.url),
      join(temporary, "scripts/dev-mode.mjs"),
    );
    writeFileSync(
      join(temporary, "app.config.json"),
      JSON.stringify({
        app: "admin-app",
        ports: { dev: 3001, mock: 4011, e2e: 3101, e2eMock: 4111 },
      }),
    );
    const reader = pathToFileURL(join(temporary, "src/lib/app-config.mjs")).href;
    const mode = pathToFileURL(join(temporary, "scripts/dev-mode.mjs")).href;
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import { appConfig, appOrigin, appSessionCookieName } from ${JSON.stringify(reader)};
      import { isStandalone } from ${JSON.stringify(mode)};
      console.log(JSON.stringify([appConfig.app, appOrigin("dev"), appOrigin("e2eMock", "127.0.0.1"),
        appSessionCookieName("development"), appSessionCookieName("production"),
        isStandalone("http://localhost:4011/api/v1"), isStandalone("http://localhost:4010/api/v1")]));
    `,
      ],
      { encoding: "utf8" },
    );
    expect(JSON.parse(output)).toEqual([
      "admin-app",
      "http://localhost:3001",
      "http://127.0.0.1:4111",
      "admin-app-session",
      "__Host-admin-app-session",
      true,
      false,
    ]);
  });
});
