import type { APIRequestContext } from "@playwright/test";
import { afterEach, expect, it, vi } from "vitest";
import { member } from "../e2e/fixtures";
import { memberFixture } from "./test/admin-fixture";

const input = vi.hoisted(() => ({
  name: "mock" as "mock" | "fastapi" | "nestjs",
  mailLink: vi.fn<() => Promise<string>>(),
}));

// 계정 옵션의 실제 분기는 e2e/fixtures.ts에서 실행하고 외부 통신 경계만 바꾼다.
vi.mock("../e2e/targets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../e2e/targets")>()),
  targetName: () => input.name,
  targetEnvironment: () => ({
    API_BASE_URL: "http://127.0.0.1:18101/api/v1",
    E2E_SEED_ADMIN_EMAIL: "configured-admin@example.com",
    E2E_SEED_ADMIN_PASSWORD: "configured-admin-password", // betterleaks:allow 사유: 계정 옵션의 가짜 비밀번호
  }),
  createTarget: () => ({ mailLink: input.mailLink }),
}));
vi.mock("./test/admin-fixture", () => ({
  memberFixture: vi.fn(() => Promise.resolve({ email: "member@example.com" })),
}));
afterEach(() => {
  vi.clearAllMocks();
});

it.each(["nestjs", "fastapi", "mock"] as const)(
  "%s 계정 옵션은 실제 백엔드 시드와 목 기본값을 구분한다",
  async (name) => {
    input.name = name;
    await member({} as APIRequestContext, "en");
    expect(memberFixture).toHaveBeenCalledTimes(1);
    expect(memberFixture).toHaveBeenCalledWith("http://127.0.0.1:18101", "en", {
      mailLink: input.mailLink,
      ...(name === "mock"
        ? {}
        : {
            seedAccount: {
              email: "configured-admin@example.com",
              password: "configured-admin-password", // betterleaks:allow 사유: 계정 옵션의 가짜 비밀번호
            },
          }),
    });
  },
);
