import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { storageInitMain } from "../../../storage-init.js";
import * as config from "../../config/settings.js";
import { SettingsError } from "../../config/settings.js";
import { settings } from "../../http/tests/fixtures.js";
import type * as StorageClient from "../client.js";
const f = vi.hoisted((): { error: unknown; requests: unknown[]; closed: string[] } => ({
  error: undefined,
  requests: [],
  closed: [],
}));
vi.mock("../client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof StorageClient>()),
  storageClients: () => ({
    internal: {
      send(command: unknown) {
        f.requests.push(command);
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 외부 SDK의 임의 거절 값도 시험한다.
        return f.error === undefined ? Promise.resolve({}) : Promise.reject(f.error);
      },
      destroy() {
        f.closed.push("internal");
      },
    },
    public: {
      destroy() {
        f.closed.push("public");
      },
    },
  }),
}));
let lines: string[];
beforeEach(() => {
  f.error = undefined;
  f.requests = [];
  f.closed = [];
  lines = [];
  vi.spyOn(config, "loadSettings").mockReturnValue(settings);
  for (const stream of [process.stdout, process.stderr])
    vi.spyOn(stream, "write").mockImplementation((chunk: string | Uint8Array) => {
      lines.push(chunk.toString());
      return true;
    });
});
afterEach(() => {
  vi.restoreAllMocks();
});
function log() {
  const rows = lines.join("").trim().split("\n").filter(Boolean);
  expect(rows).toHaveLength(1);
  return z
    .object({
      level: z.string(),
      context: z.string(),
      traceId: z.string().nullable(),
      message: z.object({
        phase: z.string(),
        category: z.string(),
        httpStatus: z.number().optional(),
      }),
    })
    .parse(JSON.parse(rows[0] ?? "{}") as unknown);
}
it("버킷 준비 실패는 안전한 JSON 원인과 종료 코드 1과 클라이언트 정리를 남긴다", async () => {
  f.error = Object.assign(new Error("시험-민감-표식"), {
    name: "AccessDenied",
    $metadata: { httpStatusCode: 403 },
    url: "https://private.example.test/?secret=시험-민감-표식",
    credentials: { key: "시험-민감-표식" },
  });
  expect(await storageInitMain()).toBe(1);
  expect(f.closed).toEqual(["internal", "public"]);
  expect(log()).toMatchObject({
    level: "error",
    context: "storage-init",
    traceId: null,
    message: { phase: "storage_init", category: "access_denied", httpStatus: 403 },
  });
  expect(lines.join("")).not.toContain("시험-민감-표식");
  expect(lines.join("")).not.toContain("https://");
});
it("설정 검증 실패는 값과 설정 오류 본문 없이 configuration으로 기록한다", async () => {
  vi.mocked(config.loadSettings).mockImplementation(() => {
    throw new SettingsError(["시험-민감-설정"]);
  });
  expect(await storageInitMain()).toBe(1);
  expect(log().message).toMatchObject({ phase: "storage_init", category: "configuration" });
  expect(lines.join("")).not.toContain("시험-민감-설정");
  expect(f.closed).toEqual([]);
});
it("알 수 없는 준비 실패는 임의 이름과 메시지와 페이로드를 남기지 않는다", async () => {
  f.error = {
    name: "시험-민감-표식",
    code: "시험-민감-표식",
    message: "시험-민감-표식",
    stack: "시험-민감-표식",
    payload: { token: "시험-민감-표식" },
  };
  expect(await storageInitMain()).toBe(1);
  expect(log().message).toMatchObject({ phase: "storage_init", category: "unknown" });
  expect(lines.join("")).not.toContain("시험-민감-표식");
  expect(f.closed).toEqual(["internal", "public"]);
});
it("버킷 준비 성공은 종료 코드 0이며 두 클라이언트를 정리한다", async () => {
  expect(await storageInitMain()).toBe(0);
  expect(f.closed).toEqual(["internal", "public"]);
  expect(lines).toEqual([]);
  expect(f.requests).toHaveLength(2);
});
