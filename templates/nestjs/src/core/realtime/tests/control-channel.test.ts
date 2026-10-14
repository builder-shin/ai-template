import { expect, it } from "vitest";
import { ControlChannel } from "../control-channel.js";
import { JsonLogger } from "../../logging/json-logger.js";
import { redisFixture } from "./redis-fixture.js";
import { deferred } from "./deferred.js";
it("같은 subscriber로 제어 채널을 받고 다른 채널은 무시한다", async () => {
  const f = redisFixture();
  const users: string[] = [];
  const channel = new ControlChannel(f.redis, new JsonLogger([]));
  try {
    await channel.subscribe((id) => {
      users.push(id);
      return Promise.resolve();
    });
    expect(f.channels.has("aitpl:15:control")).toBe(true);
    f.subscriber.emit("message", "aitpl:0:control", JSON.stringify({ userId: "다른 사용자" }));
    await channel.publishRecheck("회원");
    expect(users).toEqual(["회원"]);
    expect(f.events).toEqual(["ping", "control"]);
  } finally {
    await channel.onModuleDestroy();
  }
  expect(f.channels.size).toBe(0);
  expect(f.subscriber.listenerCount("message")).toBe(0);
});
it("adapter publisher가 flush되기 전에는 제어 메시지를 보내지 않는다", async () => {
  const f = redisFixture();
  const gate = deferred<"PONG">();
  f.redis.adapterPublisher.ping = () => gate.promise;
  const result = new ControlChannel(f.redis, new JsonLogger([])).publishRecheck("회원");
  await Promise.resolve();
  expect(f.events).toEqual([]);
  gate.resolve("PONG");
  await result;
  expect(f.events).toEqual(["control"]);
});
it("공유 Redis가 먼저 닫혀도 자기 리스너만 제거하고 종료한다", async () => {
  const f = redisFixture();
  const channel = new ControlChannel(f.redis, new JsonLogger([]));
  const adapterListener = () => {};
  f.subscriber.on("message", adapterListener);
  await channel.subscribe(() => Promise.resolve());
  Object.assign(f.subscriber, {
    status: "end",
    unsubscribe: () => Promise.reject(new Error("연결이 이미 닫혔다")),
  });
  await channel.onModuleDestroy();
  expect(f.subscriber.listeners("message")).toEqual([adapterListener]);
  f.subscriber.off("message", adapterListener);
});
