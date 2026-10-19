import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import { core } from "@opentelemetry/sdk-node";
import { Command, Redis } from "ioredis";
import { afterEach, expect, it, vi } from "vitest";
import { instrumentRedis } from "../redis-spans.js";
import { RedisClients } from "../../redis/clients.js";
import type { Settings } from "../../config/settings.js";
import { telemetryFixture, spansJson } from "./fixtures.js";
const { exporter, tracer } = telemetryFixture();
afterEach(() => vi.restoreAllMocks());
function connection(send: Redis["sendCommand"]) {
  return {
    sendCommand: send,
    duplicate() {
      return connection(send);
    },
  } as unknown as Redis;
}
it("명령마다 span을 만들고 명령 값과 키를 기록하지 않는다", async () => {
  const conn = connection((command) => {
    command.resolve("value");
    return command.promise;
  });
  instrumentRedis(conn, tracer());
  const result = await conn.sendCommand(new Command("get", ["aitpl:15:private-key"]));
  expect(result).toBe("value");
  const spans = exporter.getFinishedSpans();
  expect(spans).toHaveLength(1);
  expect(spans[0]?.name).toBe("redis GET");
  expect(spans[0]?.attributes).toEqual({ "db.system": "redis" });
  expect(spansJson(spans)).not.toContain("private-key");
});
it("명령의 수신자와 인자를 보존하고 완료 전에 span을 닫지 않는다", async () => {
  const cmd = new Command("set", ["key", "value"]);
  const seen: unknown[] = [];
  const conn = connection(function (this: Redis, ...args) {
    seen.push(this, ...args);
    return cmd.promise;
  });
  instrumentRedis(conn, tracer());
  const result = conn.sendCommand(cmd);
  expect(result).toBe(cmd.promise);
  expect(seen).toEqual([conn, cmd]);
  expect(exporter.getFinishedSpans()).toHaveLength(0);
  cmd.resolve("OK");
  await result;
  expect(exporter.getFinishedSpans()).toHaveLength(1);
});
it("같은 명령을 다시 전송해도 span은 하나만 만든다", async () => {
  const cmd = new Command("GET", ["private-key"]);
  const send = vi.fn((command: Command) => command.promise);
  const conn = connection(send);
  instrumentRedis(conn, tracer());
  expect(conn.sendCommand(cmd)).toBe(cmd.promise);
  expect(conn.sendCommand(cmd)).toBe(cmd.promise);
  expect(send).toHaveBeenCalledTimes(2);
  cmd.resolve("value");
  await cmd.promise;
  expect(exporter.getFinishedSpans()).toHaveLength(1);
});
it("부모 span을 이어 받고 중복 적용과 복제 연결에서도 명령당 하나만 만든다", async () => {
  const conn = connection((cmd) => {
    cmd.resolve("OK");
    return cmd.promise;
  });
  instrumentRedis(conn, tracer());
  instrumentRedis(conn, tracer());
  await tracer().startActiveSpan("request", async (parent) => {
    await conn.sendCommand(new Command("PING", []));
    await conn.duplicate().sendCommand(new Command("PING", []));
    parent.end();
  });
  const spans = exporter.getFinishedSpans();
  const parent = spans.find((span) => span.name === "request");
  const commands = spans.filter((span) => span.name === "redis PING");
  expect(commands).toHaveLength(2);
  for (const span of commands) {
    expect(span.spanContext().traceId).toBe(parent?.spanContext().traceId);
    expect(span.parentSpanContext?.spanId).toBe(parent?.spanContext().spanId);
  }
});
it.each(["reject", "throw"] as const)(
  "명령 오류를 그대로 전달하고 비공개 오류를 span에 넣지 않는다: %s",
  async (mode) => {
    const error = new Error("private-command-secret");
    const conn = connection((cmd) => {
      if (mode === "throw") throw error;
      cmd.reject(error);
      return cmd.promise;
    });
    instrumentRedis(conn, tracer());
    if (mode === "throw")
      expect(() => conn.sendCommand(new Command("GET", ["key"]))).toThrow(error);
    else await expect(conn.sendCommand(new Command("GET", ["key"]))).rejects.toBe(error);
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.status).toEqual({ code: SpanStatusCode.ERROR });
    expect(spans[0]?.events).toEqual([]);
    expect(spansJson(spans)).not.toContain("private-command-secret");
  },
);
it("헬스 요청의 억제 문맥에서는 Redis span을 남기지 않는다", async () => {
  const conn = connection((cmd) => {
    cmd.resolve("PONG");
    return cmd.promise;
  });
  instrumentRedis(conn, tracer());
  await context.with(core.suppressTracing(context.active()), () =>
    conn.sendCommand(new Command("PING", [])),
  );
  expect(exporter.getFinishedSpans()).toHaveLength(0);
});
it("RedisClients의 기본·추가·BullMQ 복제 연결 모두 계측한다", async () => {
  vi.spyOn(Redis.prototype, "sendCommand").mockImplementation((cmd) => {
    cmd.resolve("PONG");
    return cmd.promise;
  });
  const clients = new RedisClients({ REDIS_URL: "redis://fixture.invalid:26379/15" } as Settings);
  const duplicate = clients.connection("bullmq").duplicate();
  try {
    for (const conn of [
      clients.command,
      clients.subscriber,
      clients.adapterPublisher,
      clients.connection("jobs"),
      clients.connection("bullmq"),
      duplicate,
    ]) {
      await conn.sendCommand(new Command("PING", []));
    }
    expect(exporter.getFinishedSpans().filter((span) => span.name === "redis PING")).toHaveLength(
      6,
    );
  } finally {
    duplicate.disconnect();
    await clients.close();
  }
  expect(duplicate.status).toBe("end");
  expect(clients.command.status).toBe("end");
});
it("SDK가 없으면 명령 결과를 보존한다", async () => {
  trace.disable();
  const conn = connection((cmd) => {
    cmd.resolve("PONG");
    return cmd.promise;
  });
  instrumentRedis(conn, trace.getTracer("disabled"));
  await expect(conn.sendCommand(new Command("PING", []))).resolves.toBe("PONG");
  expect(exporter.getFinishedSpans()).toHaveLength(0);
});
