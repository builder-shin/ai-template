import { expect, it, vi } from "vitest";
import { RedisClients } from "../clients.js";
import type { Settings } from "../../config/settings.js";
const settings = { REDIS_URL: "redis://fixture.invalid:26379/15" } as Settings;
it("BullMQ 연결은 차단 명령에 맞추고 같은 이름의 연결을 공유한다", async () => {
  const clients = new RedisClients(settings);
  try {
    const bull = clients.connection("bullmq");
    expect(bull.options.maxRetriesPerRequest).toBeNull();
    expect(bull.options.commandTimeout).toBeUndefined();
    expect(bull.options.db).toBe(15);
    expect(bull.options.connectionName).toBe(`aitpl:15:${String(process.pid)}:bullmq`);
    expect(bull.status).toBe("wait");
    expect(clients.connection("bullmq")).toBe(bull);
    expect(clients.command.options.maxRetriesPerRequest).toBe(1);
    expect(clients.command.options.commandTimeout).toBe(2000);
    const duplicate = bull.duplicate();
    try {
      expect(duplicate.options.maxRetriesPerRequest).toBeNull();
      expect(duplicate.options.commandTimeout).toBeUndefined();
      expect(duplicate.status).toBe("wait");
    } finally {
      duplicate.disconnect();
    }
    expect(duplicate.status).toBe("end");
  } finally {
    await clients.close();
  }
  expect(clients.connection("bullmq").status).toBe("end");
});
it("연결은 지연 생성하고 이름과 모든 키를 시험 DB로 격리한다", async () => {
  const clients = new RedisClients(settings);
  try {
    const extra = clients.connection("jobs");
    expect(clients.prefix).toBe("aitpl:15");
    expect(clients.key("files", "u1")).toBe("aitpl:15:files:u1");
    for (const [name, client] of [
      ["command", clients.command],
      ["subscriber", clients.subscriber],
      ["adapterPublisher", clients.adapterPublisher],
      ["jobs", extra],
    ] as const) {
      expect(client.status).toBe("wait");
      expect(client.options).toMatchObject({
        lazyConnect: true,
        commandTimeout: 2000,
        maxRetriesPerRequest: 1,
        db: 15,
        connectionName: `aitpl:15:${String(process.pid)}:${name}`,
      });
    }
    expect(clients.connection("jobs")).toBe(extra);
    expect(
      new Set([clients.command, clients.subscriber, clients.adapterPublisher, extra]).size,
    ).toBe(4);
  } finally {
    await clients.close();
  }
  expect(clients.command.status).toBe("end");
});
it("준비된 연결은 quit하고 나머지는 disconnect한다", async () => {
  const clients = new RedisClients(settings);
  clients.command.status = "ready";
  const quit = vi.spyOn(clients.command, "quit").mockResolvedValue("OK");
  const disconnect = vi.spyOn(clients.command, "disconnect");
  await clients.onModuleDestroy();
  expect(quit).toHaveBeenCalledOnce();
  expect(disconnect).not.toHaveBeenCalled();
  expect(clients.subscriber.status).toBe("end");
  expect(clients.adapterPublisher.status).toBe("end");
  clients.command.status = "wait";
  clients.command.disconnect();
});
it("quit 실패 때도 모든 연결을 정리한다", async () => {
  const clients = new RedisClients(settings);
  clients.command.status = "ready";
  vi.spyOn(clients.command, "quit").mockRejectedValue(new Error("종료 실패"));
  const disconnect = vi.spyOn(clients.command, "disconnect");
  await clients.close();
  expect(disconnect).toHaveBeenCalledOnce();
  clients.command.status = "wait";
  clients.command.disconnect();
  expect(clients.subscriber.status).toBe("end");
  expect(clients.adapterPublisher.status).toBe("end");
});
it("경로 없는 URL의 DB 쿼리가 개발 DB 0을 바꾸지 않는다", async () => {
  const clients = new RedisClients({ REDIS_URL: "redis://fixture.invalid:26379?db=1" } as Settings);
  try {
    expect(clients.prefix).toBe("aitpl:0");
    expect(clients.command.options.db).toBe(0);
    expect(clients.command.status).toBe("wait");
  } finally {
    await clients.close();
  }
});
it("URL 쿼리가 고정 시간 제한과 연결 이름을 바꾸지 않는다", async () => {
  const clients = new RedisClients({
    REDIS_URL:
      "redis://fixture.invalid:26379/15?commandTimeout=9999&maxRetriesPerRequest=8&connectionName=foreign",
  } as Settings);
  try {
    expect(clients.command.options).toMatchObject({
      commandTimeout: 2000,
      maxRetriesPerRequest: 1,
      connectionName: `aitpl:15:${String(process.pid)}:command`,
    });
    expect(clients.command.status).toBe("wait");
  } finally {
    await clients.close();
  }
});
