import { EventEmitter } from "node:events";
import type { RedisClients } from "../../redis/clients.js";
export function redisFixture() {
  const values = new Map<string, string>();
  const channels = new Set<string>();
  const events: string[] = [];
  const subscriber = Object.assign(new EventEmitter(), {
    subscribe: (channel: string) => {
      channels.add(channel);
      return Promise.resolve(1);
    },
    unsubscribe: (channel: string) => {
      channels.delete(channel);
      return Promise.resolve(0);
    },
  });
  const adapterPublisher = {
    ping: () => {
      events.push("ping");
      return Promise.resolve("PONG");
    },
    publish: () => Promise.resolve(0),
  };
  const command = {
    set: (key: string, value: string, _mode: string, ttl: number) => {
      if (ttl !== 30) throw new Error("잘못된 TTL이다");
      values.set(key, value);
      return Promise.resolve("OK");
    },
    getdel: (key: string) => {
      const value = values.get(key);
      values.delete(key);
      return Promise.resolve(value ?? null);
    },
    publish: (channel: string, message: string) => {
      events.push("control");
      if (channels.has(channel)) subscriber.emit("message", channel, message);
      return Promise.resolve(1);
    },
  };
  const redis = {
    prefix: "aitpl:15",
    command,
    subscriber,
    adapterPublisher,
  } as unknown as RedisClients;
  return { redis, subscriber, channels, events, values };
}
