import { afterEach, expect, it } from "vitest";
import { seedPosts } from "../index.js";
import { fixture, authorId, post, otherId } from "./fixtures.js";
const owned: ReturnType<typeof fixture>[] = [];
afterEach(() => {
  for (const f of owned.splice(0)) f.close();
});
it("저자의 글이 없을 때 발행 두 개와 초안 하나를 한 번만 심는다", async () => {
  const f = fixture([]);
  owned.push(f);
  await f.unit.run((tx) => seedPosts(tx, authorId));
  expect(f.state.posts.map((p) => p.status).sort()).toEqual(["draft", "published", "published"]);
  expect(f.state.posts.every((p) => p.authorId === authorId)).toBe(true);
  expect(
    f.state.posts.filter((p) => p.status === "published").every((p) => p.publishedAt !== null),
  ).toBe(true);
  await f.unit.run((tx) => seedPosts(tx, authorId));
  expect(f.state.posts).toHaveLength(3);
});
it("다른 저자의 글은 시드를 막지 않고 기존 저자 글은 덮어쓰지 않는다", async () => {
  const f = fixture([post("draft", { authorId: otherId })]);
  owned.push(f);
  await f.unit.run((tx) => seedPosts(tx, otherId));
  expect(f.state.posts).toHaveLength(1);
  await f.unit.run((tx) => seedPosts(tx, authorId));
  expect(f.state.posts).toHaveLength(4);
});
