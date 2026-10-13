import { execFileSync } from "node:child_process";
import { expect, it, vi } from "vitest";
import { prismaCommand } from "../runtime.js";
vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
it("Prisma 실행은 설치된 고정 CLI와 URL을 자식 환경으로 넘긴다", () => {
  prismaCommand("postgresql://fixture:fixture@fixture.invalid/app", ["generate"]); // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
  const call = vi.mocked(execFileSync).mock.calls[0];
  expect(call?.[0]).toBe(process.execPath);
  expect(call?.[1]).toEqual(["node_modules/prisma/build/index.js", "generate"]);
  expect(call?.[2]).toHaveProperty(
    "env.DATABASE_URL",
    "postgresql://fixture:fixture@fixture.invalid/app", // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
  );
});
