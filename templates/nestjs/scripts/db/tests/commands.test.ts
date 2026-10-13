import { afterEach, expect, it, vi } from "vitest";
import { migrate } from "../migrate.js";
import { reset } from "../reset.js";
import { revision } from "../revision.js";
const fixture = vi.hoisted(() => ({ order: [] as unknown[], foreign: false, remote: false }));
vi.mock("../guard.js", () => ({
  assertProjectDatabase: async (url: string) => {
    fixture.order.push(["guard", url]);
    if (fixture.foreign) throw new Error("다른 DB");
    return Promise.resolve();
  },
  assertLocalDatabase: (url: string) => {
    fixture.order.push(["local", url]);
    if (fixture.remote) throw new Error("외부 DB");
  },
}));
vi.mock("../../runtime.js", () => ({
  prismaCommand: (url: string, args: readonly string[]) => {
    fixture.order.push(["prisma", url, args]);
  },
  isMain: () => false,
}));
afterEach(() => {
  fixture.order = [];
  fixture.foreign = false;
  fixture.remote = false;
  vi.restoreAllMocks();
});
const url = "postgresql://app:app@fixture.invalid/app"; // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
it("migrate는 소유 검사 뒤 고정 Prisma deploy를 실행한다", async () => {
  await migrate(url);
  expect(fixture.order).toEqual([
    ["guard", url],
    ["prisma", url, ["migrate", "deploy"]],
  ]);
});
it("외국 DB는 migrate를 실행하지 않는다", async () => {
  fixture.foreign = true;
  await expect(migrate(url)).rejects.toThrow("다른 DB");
  expect(fixture.order).toEqual([["guard", url]]);
});
it("reset은 로컬과 소유 검사 뒤에만 강제 reset한다", async () => {
  await reset(url);
  expect(fixture.order).toEqual([
    ["local", url],
    ["guard", url],
    ["prisma", url, ["migrate", "reset", "--force"]],
  ]);
});
it("외부 reset은 소유 조회도 하지 않는다", async () => {
  fixture.remote = true;
  await expect(reset(url)).rejects.toThrow("외부 DB");
  expect(fixture.order).toEqual([["local", url]]);
});
it("revision은 이름이 없으면 사용법과 2를 반환한다", async () => {
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  expect(await revision(url, [])).toBe(2);
  expect(stderr).toHaveBeenCalledWith("사용법: pnpm db:revision <이름>\n");
  expect(fixture.order).toEqual([]);
});
it("revision은 이름을 shell 없이 create-only 인수로 넘긴다", async () => {
  expect(await revision(url, ["accounts"])).toBe(0);
  expect(fixture.order).toEqual([
    ["guard", url],
    ["prisma", url, ["migrate", "dev", "--create-only", "--name", "accounts"]],
  ]);
});
