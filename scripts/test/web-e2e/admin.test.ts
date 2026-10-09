import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { record, validateCompose } from "../../src/web-e2e/config.ts";
import { createPlan, appCommand } from "../../src/web-e2e/plan.ts";

const root = resolve(import.meta.dirname, "../../..");
const plan = createPlan("offline-admin", root, "admin");
const compose = () => readFileSync(resolve(root, plan.composeFile), "utf8");

describe("admin 전용 스택", () => {
  it("web과 프로젝트·이미지·실행 환경·포트를 공유하지 않는다", () => {
    expect(plan.project).toBe("ai-template-admin-e2e-offline-admin");
    expect(plan.composeFile).toBe("scripts/compose/nextjs-admin-e2e-fastapi.yaml");
    expect(plan.env).toEqual({ ADMIN_E2E_RUN_ID: "offline-admin", COMPOSE_DISABLE_ENV_FILE: "1" });
    expect(plan.appEnv).toEqual({
      E2E_TARGET: "fastapi",
      APP_URL: "http://localhost:3101",
      API_BASE_URL: "http://127.0.0.1:18101/api/v1",
      NEXT_PUBLIC_REALTIME_URL: "http://127.0.0.1:18101",
      E2E_MAILPIT_URL: "http://127.0.0.1:28126",
      E2E_RECENT_LOGIN_SECONDS: "10",
      E2E_SEED_ADMIN_EMAIL: "admin-e2e-admin@example.com",
      E2E_SEED_ADMIN_PASSWORD: "admin-e2e-only-admin-password", // betterleaks:allow 전용 스택의 가짜 비밀번호
    });
    const web = createPlan("offline-admin", root);
    expect(plan.ports.map(({ port }) => port)).toEqual([3101, 18101, 28434, 28126]);
    for (const { port } of plan.ports)
      expect(web.ports.map((item) => item.port)).not.toContain(port);
    expect(plan.commands.removeImage).toEqual([
      "docker",
      "image",
      "rm",
      "ai-template-admin-e2e-fastapi:offline-admin",
    ]);
    expect(appCommand(plan, "pnpm.exe")).toEqual([
      "pnpm.exe",
      "--dir",
      resolve(root, "templates/nextjs-admin"),
      "test:e2e",
    ]);
  });

  it("독립 compose를 검증하고 OAuth 서비스 없이 모든 설정을 명시한다", () => {
    expect(() => {
      validateCompose(compose(), plan);
    }).not.toThrow();
    const services = record(record(parse(compose(), { merge: true })).services);
    expect(services).not.toHaveProperty("oauth");
    const fields = readFileSync(
      resolve(root, "templates/fastapi/src/app/core/config.py"),
      "utf8",
    ).matchAll(/^ {4}([a-z][a-z_]+): /gm);
    for (const [, field] of fields)
      expect(record(services.api).environment).toHaveProperty(field?.toUpperCase() ?? "");
  });

  it.each([
    ["ports", ["0.0.0.0:18101:8000"]],
    ["env_file", ".env"],
    ["image", "ai-template-web-e2e-fastapi:other"],
  ])("API 설정 거절 (%s)", (key, value) => {
    const doc = record(parse(compose(), { merge: true }));
    record(record(doc.services).api)[key] = value;
    expect(() => {
      validateCompose(stringify(doc), plan);
    }).toThrow();
  });

  it.each([
    ["FRONTEND_URL", "http://localhost:3100"],
    ["REALTIME_ALLOWED_ORIGINS", "http://localhost:3001"],
    ["STORAGE_ALLOWED_ORIGINS", "http://localhost:3000"],
    ["SEED_ADMIN_EMAIL", "admin@example.com"],
    ["SEED_ADMIN_PASSWORD", "admin-password"], // betterleaks:allow 예시 비밀번호
    ["RECENT_LOGIN_SECONDS", "600"],
    ["RATE_LIMIT_LOGIN_IP", "5"],
  ])("환경 설정 거절 (%s)", (key, value) => {
    const doc = record(parse(compose(), { merge: true }));
    record(record(record(doc.services).api).environment)[key] = value;
    expect(() => {
      validateCompose(stringify(doc), plan);
    }).toThrow();
  });

  it("web compose 또는 개발 프로젝트로 바꾼 계획을 거절한다", () => {
    expect(() => {
      validateCompose(compose(), { ...plan, project: "fastapi" });
    }).toThrow();
    expect(() => {
      validateCompose(compose(), { ...plan, composeFile: createPlan("web").composeFile });
    }).toThrow();
  });
});
