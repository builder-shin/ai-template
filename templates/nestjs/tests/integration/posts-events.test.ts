import { expect, it, vi } from "vitest";
import { io } from "socket.io-client";
import request from "supertest";
import { launch, seedRealtime, connect, ack } from "./realtime-fixture.js";
import { resourceDocument } from "./admin-fixture.js";
import { mediaType } from "./session-fixture.js";
it("posts는 발행 이벤트와 취소 식별자만 받고 posts:all은 초안도 받는다", async () => {
  const f = await seedRealtime(),
    api = await launch("api");
  const admin = await connect(api.url, f.firstToken);
  expect(await ack(admin, "subscribe", "posts:all")).toEqual({ ok: true });
  const publicSocket = io(api.url, {
    transports: ["websocket"],
    autoConnect: false,
    reconnection: false,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      publicSocket.once("connect", resolve);
      publicSocket.once("connect_error", reject);
      publicSocket.connect();
    });
    expect(await ack(publicSocket, "subscribe", "posts")).toEqual({ ok: true });
    const all: { name: string; payload: unknown }[] = [],
      visible: typeof all = [];
    for (const name of [
      "post.created",
      "post.updated",
      "post.published",
      "post.unpublished",
      "post.deleted",
    ]) {
      admin.on(name, (payload: unknown) => {
        all.push({ name, payload });
      });
      publicSocket.on(name, (payload: unknown) => {
        visible.push({ name, payload });
      });
    }
    const http = request(api.url);
    const create = () =>
      http
        .post("/api/v1/posts")
        .set("Authorization", "Bearer " + f.firstToken)
        .set("Content-Type", mediaType)
        .send({ data: { type: "posts", attributes: { title: "실시간 글", body: "초안 본문" } } });
    const created = await create();
    expect(created.status).toBe(201);
    const id = resourceDocument(created.text).data.id;
    const update = (attributes: object) =>
      http
        .patch("/api/v1/posts/" + id)
        .set("Authorization", "Bearer " + f.firstToken)
        .set("Content-Type", mediaType)
        .send({ data: { type: "posts", id, attributes } });
    expect((await update({ status: "published" })).status).toBe(200);
    await vi.waitFor(() => {
      expect(visible).toHaveLength(1);
      expect(all).toHaveLength(2);
    });
    expect(visible[0]?.name).toBe("post.published");
    expect((await update({ status: "draft", body: "새 비밀 본문" })).status).toBe(200);
    await vi.waitFor(() => {
      expect(visible).toHaveLength(2);
      expect(all).toHaveLength(3);
    });
    expect(visible[1]).toEqual({
      name: "post.unpublished",
      payload: { data: { type: "posts", id } },
    });
    expect((await update({ title: "초안 수정" })).status).toBe(200);
    expect(
      (await http.delete("/api/v1/posts/" + id).set("Authorization", "Bearer " + f.firstToken))
        .status,
    ).toBe(204);
    const barrier = await create();
    expect(barrier.status).toBe(201);
    const barrierId = resourceDocument(barrier.text).data.id;
    expect(
      (
        await http
          .patch("/api/v1/posts/" + barrierId)
          .set("Authorization", "Bearer " + f.firstToken)
          .set("Content-Type", mediaType)
          .send({ data: { type: "posts", id: barrierId, attributes: { status: "published" } } })
      ).status,
    ).toBe(200);
    await vi.waitFor(() => {
      expect(visible).toHaveLength(3);
      expect(all).toHaveLength(7);
    });
    expect(all.map((event) => event.name)).toEqual([
      "post.created",
      "post.published",
      "post.updated",
      "post.updated",
      "post.deleted",
      "post.created",
      "post.published",
    ]);
    expect(visible.map((event) => event.name)).toEqual([
      "post.published",
      "post.unpublished",
      "post.published",
    ]);
    expect(JSON.stringify(visible)).not.toContain("새 비밀 본문");
  } finally {
    publicSocket.disconnect();
  }
});
