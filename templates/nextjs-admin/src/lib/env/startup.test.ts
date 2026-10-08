import * as fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({ writeSync: vi.fn() }));

const valid = {
  NODE_ENV: "production",
  API_BASE_URL: "http://runtime-api.example/api/v1",
  APP_URL: "http://runtime-web.example",
  NEXT_PUBLIC_REALTIME_URL: "http://runtime-realtime.example",
  SESSION_SECRET: "x".repeat(32), // betterleaks:allow 사유: 시작 검증 테스트용 가짜 비밀
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("공유 시작 검증", () => {
  it("유효한 설정은 안내나 종료 없이 반환한다", async () => {
    const { exitOnInvalidEnv } = await import("./startup");
    const write = vi.mocked(fs.writeSync).mockReturnValue(0);
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("예상하지 않은 종료");
    });

    expect(exitOnInvalidEnv(valid)).toBeUndefined();
    expect(write).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("잘못된 설정은 값과 스택 없이 안내하고 종료 코드 1을 쓴다", async () => {
    const { exitOnInvalidEnv } = await import("./startup");
    const write = vi.mocked(fs.writeSync).mockReturnValue(0);
    const exitSignal = new Error("검사한 종료");
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw exitSignal;
    });
    const secret = "private-short-value"; // betterleaks:allow 사유: 누출 거절 테스트용 가짜 비밀

    expect(() => exitOnInvalidEnv({ ...valid, SESSION_SECRET: secret })).toThrow(exitSignal);
    expect(write).toHaveBeenCalledExactlyOnceWith(
      2,
      "SESSION_SECRET: 32바이트 이상의 비밀을 설정한다.\n",
    );
    expect(write.mock.calls[0]?.[1]).not.toContain(secret);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
