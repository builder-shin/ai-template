import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { fixture, file, principal, attributes } from "./fixtures.js";
import { registerFileReadRule } from "../index.js";
const fixtures: ReturnType<typeof fixture>[] = [];
const make = (overrides?: Parameters<typeof fixture>[0]) => {
  const f = fixture(overrides);
  fixtures.push(f);
  return f;
};
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
  vi.useRealTimers();
});
const document = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      filename: z.string(),
      size: z.number(),
      status: z.string(),
      createdAt: z.string(),
    }),
    meta: z
      .object({
        upload: z
          .object({
            url: z.string(),
            method: z.literal("PUT"),
            headers: z.object({ "Content-Type": z.string() }),
            expiresAt: z.string(),
          })
          .optional(),
        downloadUrl: z.string().optional(),
        downloadUrlExpiresAt: z.string().optional(),
      })
      .optional(),
  }),
});
it("크기 초과를 타입과 한도보다 먼저 거절한다", async () => {
  const f = make({ FILE_USER_QUOTA: 1 });
  await expect(
    f.service.create(principal, { ...attributes, size: 101, contentType: "text/plain" }),
  ).rejects.toMatchObject({ init: { status: 422, code: "file.too_large" } });
  expect(f.events).toEqual([]);
});
it("허용하지 않은 타입을 한도보다 먼저 거절한다", async () => {
  const f = make({ FILE_USER_QUOTA: 1 });
  await expect(
    f.service.create(principal, { ...attributes, contentType: "text/plain" }),
  ).rejects.toMatchObject({ init: { status: 422, code: "file.type_not_allowed" } });
  expect(f.events).toEqual([]);
});
it("pending과 ready 크기 합이 한도를 넘으면 생성하지 않는다", async () => {
  const f = make();
  f.add({ size: 40n });
  f.add({ id: "f2", size: 40n, status: "ready" });
  await expect(f.service.create(principal, attributes)).rejects.toMatchObject({
    init: { status: 422, code: "file.quota_exceeded" },
  });
  expect(f.files).toHaveLength(2);
  expect(f.events).toEqual(["begin", "lock:u1", "sum", "rollback"]);
});
it("한도 경계는 성공하고 다른 소유자의 크기는 제외한다", async () => {
  const f = make();
  f.add({ size: 77n });
  f.add({ id: "other", ownerId: "u2", size: 100n });
  const value = document.parse(await f.service.create(principal, attributes));
  expect(value.data.attributes).toMatchObject({
    filename: "그림.png",
    size: 23,
    status: "pending",
  });
  expect(value.data.meta?.upload).toMatchObject({
    method: "PUT",
    headers: { "Content-Type": "image/png" },
  });
  expect(f.events).toEqual(["begin", "lock:u1", "sum", "insert", "commit"]);
  expect(f.files[2]?.size).toBe(23n);
});
it("완료 때 객체가 없으면 pending을 유지한다", async () => {
  const f = make();
  f.add();
  await expect(f.service.complete(principal, "f1")).rejects.toMatchObject({
    init: { status: 422, code: "file.upload_incomplete" },
  });
  expect(f.files[0]?.status).toBe("pending");
});
it("HEAD의 선언 크기나 타입이 다르면 완료하지 않는다", async () => {
  const f = make();
  f.add();
  f.objects.set(file.key, { ContentLength: 24, ContentType: "image/png" });
  await expect(f.service.complete(principal, "f1")).rejects.toMatchObject({
    init: { code: "file.upload_incomplete" },
  });
  f.objects.set(file.key, { ContentLength: 23, ContentType: "text/plain" });
  await expect(f.service.complete(principal, "f1")).rejects.toMatchObject({
    init: { code: "file.upload_incomplete" },
  });
});
it("내부 HEAD로 완료하고 같은 파일의 안정된 속성을 돌려준다", async () => {
  const f = make();
  f.add();
  f.objects.set(file.key, { ContentLength: 23, ContentType: "image/png" });
  const completed = document.parse(await f.service.complete(principal, "f1"));
  const read = document.parse(await f.service.get(principal, "f1"));
  expect(completed.data.attributes.status).toBe("ready");
  expect(read.data.attributes).toEqual(completed.data.attributes);
  expect(new URL(read.data.meta?.downloadUrl ?? "").origin).toBe("https://public.example.test");
  expect(f.events).toContain("head:u1/f1");
});
it("보이지 않는 남의 파일은 읽기와 수정과 삭제에서 404다", async () => {
  const f = make();
  f.add({ ownerId: "u2" });
  await expect(f.service.get(principal, "f1")).rejects.toMatchObject({
    init: { status: 404, code: "resource.not_found" },
  });
  await expect(f.service.complete(principal, "f1")).rejects.toMatchObject({
    init: { status: 404 },
  });
  await expect(f.service.delete(principal, "f1")).rejects.toMatchObject({ init: { status: 404 } });
  expect(f.files).toHaveLength(1);
});
it("규칙으로 보이는 남의 커버는 읽지만 수정과 삭제는 403이다", async () => {
  registerFileReadRule((_tx, _viewer, ids) =>
    Promise.resolve(new Set(ids.filter((id) => id === "shared"))),
  );
  const f = make();
  f.add({ id: "shared", ownerId: "u2", status: "ready" });
  expect(document.parse(await f.service.get(undefined, "shared")).data.id).toBe("shared");
  await expect(f.service.complete(principal, "shared")).rejects.toMatchObject({
    init: { status: 403, code: "permission.denied" },
  });
  await expect(f.service.delete(principal, "shared")).rejects.toMatchObject({
    init: { status: 403 },
  });
});
it("삭제는 행 commit 뒤 객체를 제거한다", async () => {
  const f = make();
  f.add();
  f.objects.set(file.key, { ContentLength: 23, ContentType: "image/png" });
  await f.service.delete(principal, "f1");
  expect(f.files).toEqual([]);
  expect(f.objects.size).toBe(0);
  expect(f.events).toEqual(["begin", "delete-row", "commit", "delete-object"]);
});
it("commit 실패 때 객체를 지우지 않는다", async () => {
  const f = make();
  f.add();
  f.objects.set(file.key, { ContentLength: 23, ContentType: "image/png" });
  f.failCommit = true;
  await expect(f.service.delete(principal, "f1")).rejects.toThrow("commit 실패");
  expect(f.objects.size).toBe(1);
  expect(f.files).toHaveLength(1);
});
it("안전 정수 밖의 저장 크기는 응답으로 보내지 않는다", async () => {
  const f = make();
  f.add({ size: 9007199254740992n });
  await expect(f.service.get(principal, "f1")).rejects.toThrow(
    "파일 크기가 안전 정수 범위를 벗어났다",
  );
});
it("풀린 파일을 표시하고 오래된 pending과 함께 commit 뒤 정리한다", async () => {
  const f = make();
  f.add({ createdAt: new Date(Date.now() - 86_400_001) });
  f.add({ id: "recent", createdAt: new Date() });
  f.add({ id: "detached", status: "ready", createdAt: new Date() });
  f.add({ id: "attached", status: "ready" });
  await f.unit.run((tx) => f.service.detach(tx, ["detached"]));
  expect(f.files.find((f) => f.id === "detached")?.detachedAt).toBeInstanceOf(Date);
  await f.service.purgePending();
  expect(f.files.map((f) => f.id)).toEqual(["recent", "attached"]);
  expect(f.events.slice(-2)).toEqual(["delete-object", "delete-object"]);
});
it("정확히 24시간 된 pending은 다음 정리까지 유지한다", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T01:00:00Z"));
  const f = make();
  f.add({ createdAt: new Date("2026-10-14T01:00:00Z") });
  await f.service.purgePending();
  expect(f.files.map((f) => f.id)).toEqual(["f1"]);
});
it("include 로더는 숨겨진 파일을 제외하고 ready의 다운로드 정보를 유지한다", async () => {
  const f = make();
  f.add({ status: "ready" });
  f.add({ id: "hidden", ownerId: "u2" });
  const data = await f.unit.run((tx) => f.service.load(tx, ["f1", "hidden"], principal));
  expect(data.map((f) => f.id)).toEqual(["f1"]);
  expect(data[0]).toMatchObject({
    attributes: { status: "ready" },
  });
  const download = z.object({ meta: z.object({ downloadUrl: z.string() }) }).parse(data[0]);
  expect(download.meta.downloadUrl).toContain("https://public.example.test/");
});
