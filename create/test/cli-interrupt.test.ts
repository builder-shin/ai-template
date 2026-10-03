import { expect, it, vi } from "vitest";
import { createProject } from "../src/create.ts";
import { CreateError } from "../src/errors.ts";

vi.mock("../src/create.ts", () => ({ createProject: vi.fn() }));
vi.mock("../src/repository.ts", () => ({ findRepository: () => process.cwd() }));

it.each(["SIGINT", "SIGTERM"] as const)(
  "CLI는 %s를 기록하고 정리 뒤 130을 반환한다",
  async (signal) => {
    const argv = process.argv;
    const code = process.exitCode;
    process.argv = [process.execPath, "cli.ts", "aitpl-app", "--template", "nextjs"];
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(createProject).mockImplementation(() => {
      expect(process.listenerCount(signal)).toBeGreaterThan(0);
      process.emit(signal);
      throw new CreateError("자식이 중단됐다", "다시 실행한다.");
    });
    try {
      vi.resetModules();
      await import("../src/cli.ts");
      expect(process.exitCode).toBe(130);
      expect(output).toHaveBeenCalledTimes(1);
    } finally {
      process.argv = argv;
      process.exitCode = code;
      vi.restoreAllMocks();
    }
  },
);
