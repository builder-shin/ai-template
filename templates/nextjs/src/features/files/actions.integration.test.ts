import { afterAll, beforeAll, beforeEach, expect, inject, it, vi } from "vitest";
import { EXAMPLE_SESSION_SECRET } from "../../lib/env";
import { readSession } from "../../lib/session/request";
import { fileOwnerFixture } from "./test-fixture";
import { createFileAction, readyFileAction } from "./actions";

vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("../../lib/session/request", async (original) => ({
  ...(await original<typeof import("../../lib/session/request")>()),
  readSession: vi.fn(),
}));
let owner: Awaited<ReturnType<typeof fileOwnerFixture>>;
beforeAll(async () => {
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("APP_URL", inject("httpBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  owner = await fileOwnerFixture();
});
beforeEach(() => vi.mocked(readSession).mockResolvedValue(owner.session));
afterAll(async () => {
  await owner?.stop();
  vi.unstubAllEnvs();
});
function fields(type = "image/png", size = 4) {
  const data = new FormData();
  data.set("filename", "cover.png");
  data.set("contentType", type);
  data.set("size", String(size));
  return data;
}
it("실제 presigned PUT의 헤더·CORS를 사용하고 ready 확인 후 파일 id와 다운로드를 돌려준다", async () => {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
    "base64",
  );
  const result = await createFileAction(fields("image/png", bytes.length), "/en/my-posts/new");
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("파일 생성 실패");
  expect(result.upload.method).toBe("PUT");
  expect(result.upload.headers).toEqual({ "Content-Type": "image/png" });
  const preflight = await fetch(result.upload.url, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  expect(preflight.headers.get("Access-Control-Allow-Methods")).toContain("PUT");
  const put = await fetch(result.upload.url, {
    method: result.upload.method,
    headers: result.upload.headers,
    body: bytes,
  });
  expect(put.status).toBe(200);
  const ready = await readyFileAction(result.id, "/en/my-posts/new");
  expect(ready).toMatchObject({ ok: true, file: { id: result.id } });
  if (!ready.ok) throw new Error("ready 실패");
  const download = await fetch(ready.file.url);
  expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
});
it.each([
  ["image/png", 10485761, "The file must be no larger than 10485760 bytes.", "size"],
  ["text/html", 4, "This file type is not allowed.", "contentType"],
] as const)("%s %i의 업로드 검증 오류를 번역한다", async (type, size, message, field) => {
  expect(await createFileAction(fields(type, size), "/my-posts/new")).toMatchObject({
    ok: false,
    fieldErrors: { [field]: [message] },
  });
});
it("올리지 않은 파일은 ready가 되지 않고 upload_incomplete를 번역한다", async () => {
  const created = await createFileAction(fields(), "/my-posts/new");
  if (!created.ok) throw new Error("파일 생성 실패");
  expect(await readyFileAction(created.id, "/my-posts/new")).toMatchObject({
    ok: false,
    formError: "Complete the file upload.",
  });
});
it("폐기된 세션은 업로드 화면으로 돌아오는 로그인 경로로 보낸다", async () => {
  vi.mocked(readSession).mockResolvedValue({
    ...owner.session,
    accessToken: "revoked-upload-session",
  });
  await expect(createFileAction(fields(), "/en/my-posts/new")).rejects.toThrow(
    /redirect:\/session\/clear\?returnTo=%2Fen%2Fmy-posts%2Fnew/,
  );
});
