import { afterEach, expect, it } from "vitest";
import type { AfterCommit, Tx } from "../../../core/db/unit-of-work.js";
import { PostsRepository } from "../index.js";
import { fixture, post, author, postId, fileId, required } from "./fixtures.js";
const owned: ReturnType<typeof fixture>[] = [];
afterEach(() => {
  for (const f of owned.splice(0)) f.close();
});
const setup = (initial = [post()]) => {
  const f = fixture(initial);
  owned.push(f);
  return f;
};
it("표지 잠금은 대소문자가 섞인 UUID도 PostgreSQL 순서로 한 번씩 얻는다", async () => {
  const a = "01900000-0000-7000-8000-00000000000a";
  const b = "01900000-0000-7000-8000-00000000000b";
  const locked: string[] = [];
  const tx = {
    $queryRaw: (_sql: TemplateStringsArray, id: string) => {
      locked.push(id);
      return Promise.resolve([]);
    },
  } as unknown as Tx;
  await new PostsRepository().lockCovers(tx, [b.toUpperCase(), a, a.toUpperCase()]);
  expect(locked).toEqual([a, b]);
});
it("시간별 정리는 아바타의 mark-only 분리 뒤에도 공유 post 표지를 보존한다", async () => {
  const f = setup([post("draft", { coverImageId: fileId })]);
  await f.unit.run((tx) => f.files.detach(tx, [fileId]));
  expect(f.state.files[0]?.detachedAt).toBeInstanceOf(Date);
  await f.files.purgePending();
  expect(f.state.files).toHaveLength(1);
  expect(f.state.files[0]?.detachedAt).toBeNull();
  expect(f.state.posts[0]?.coverImageId).toBe(fileId);
  expect(f.removedObjects).toEqual([]);
});
it("신뢰된 참조 로더도 정확한 id의 완료 파일만 반환한다", async () => {
  const f = setup();
  const loaded = await f.unit.run((tx) =>
    f.files.loadReferenced(tx, [fileId, fileId, "없는 파일"]),
  );
  expect(loaded).toHaveLength(1);
  expect(loaded[0]).toMatchObject({
    id: fileId,
    meta: { downloadUrl: expect.any(String) as unknown },
  });
  required(f.state.files[0]).status = "pending";
  expect(await f.unit.run((tx) => f.files.loadReferenced(tx, [fileId]))).toEqual([]);
});
it("정확한 분리 파일만 cause commit 뒤 행과 객체를 지운다", async () => {
  const f = setup([]);
  f.state.files.push({ ...required(f.state.files[0]), id: "other", key: "other" });
  await f.unit.run((tx, afterCommit) => f.files.detach(tx, [fileId], afterCommit));
  expect(f.state.files.map((file) => file.id)).toEqual(["other"]);
  expect(f.removedObjects).toEqual(["cover"]);
  expect(f.trace.indexOf("COMMIT")).toBeLessThan(f.trace.indexOf("LOCK"));
});
it("분리 트랜잭션이 rollback되면 삭제 hook도 실행하지 않는다", async () => {
  const f = setup([]);
  f.failCommit = true;
  await expect(
    f.unit.run((tx, afterCommit) => f.files.detach(tx, [fileId], afterCommit)),
  ).rejects.toThrow("commit 실패");
  expect(f.state.files[0]?.detachedAt).toBeNull();
  expect(f.removedObjects).toEqual([]);
});
it.each(["post", "avatar"])("공유 %s 참조가 있으면 분리 파일을 보존한다", async (reference) => {
  const f = setup([]);
  if (reference === "post") f.state.posts.push(post("draft", { coverImageId: fileId }));
  else f.state.avatarIds.push(fileId);
  await f.unit.run((tx, afterCommit) => f.files.detach(tx, [fileId], afterCommit));
  expect(f.state.files).toHaveLength(1);
  expect(f.removedObjects).toEqual([]);
  expect(f.state.files[0]?.detachedAt).toBeNull();
});
it("commit 뒤 재연결된 파일은 hook에서 다시 검사하여 보존한다", async () => {
  const f = setup([]),
    hooks: (() => void | Promise<void>)[] = [];
  const afterCommit: AfterCommit = (hook) => {
    hooks.push(hook);
  };
  await f.unit.run((tx) => f.files.detach(tx, [fileId], afterCommit));
  required(f.state.files[0]).detachedAt = null;
  for (const hook of hooks) await hook();
  expect(f.state.files).toHaveLength(1);
  expect(f.removedObjects).toEqual([]);
  expect(f.trace).toContain("LOCK");
});
it("표지 변경은 파일을 잠그고 붙이며 삭제는 분리한 객체를 정리한다", async () => {
  const f = setup();
  await f.service.update(author, postId, {
    relationships: { coverImage: { data: { type: "files", id: fileId } } },
  });
  expect(f.state.posts[0]?.coverImageId).toBe(fileId);
  expect(f.trace).toContain("LOCK");
  await f.service.delete(author, postId);
  expect(f.state.files).toEqual([]);
  expect(f.removedObjects).toEqual(["cover"]);
});
it.each([
  { label: "잘못된 UUID", id: "bad", status: 404 },
  { label: "없는 파일", id: "01900000-0000-7000-8000-000000000099", status: 404 },
  { label: "다른 소유자", id: fileId, status: 404, ownerId: "다른 소유자" },
  { label: "완료 전 파일", id: fileId, status: 422, pending: true },
])("표지의 $label 연결은 $status 응답으로 거절한다", async ({ id, status, ownerId, pending }) => {
  const f = setup();
  if (ownerId) required(f.state.files[0]).ownerId = ownerId;
  if (pending) required(f.state.files[0]).status = "pending";
  await expect(
    f.service.update(author, postId, {
      relationships: { coverImage: { data: { type: "files", id } } },
    }),
  ).rejects.toMatchObject({ init: { status } });
  expect(f.state.posts[0]?.coverImageId).toBeNull();
  expect(f.events).toEqual([]);
});
