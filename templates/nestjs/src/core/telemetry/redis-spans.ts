import { SpanKind, SpanStatusCode, type Tracer } from "@opentelemetry/api";
import type { Command, Redis } from "ioredis";
const instrumented = new WeakSet<Redis>();
const wrapped = new WeakSet<Command>();
export function instrumentRedis(connection: Redis, tracer: Tracer): void {
  if (instrumented.has(connection)) return;
  instrumented.add(connection);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 아래 call이 원본 메서드에 실제 수신자를 전달한다
  const send = connection.sendCommand;
  connection.sendCommand = function (command, ...args) {
    if (wrapped.has(command)) return send.call(this, command, ...args);
    wrapped.add(command);
    return tracer.startActiveSpan(
      `redis ${command.name.toUpperCase()}`,
      { kind: SpanKind.CLIENT, attributes: { "db.system": "redis" } },
      (span) => {
        try {
          const result = send.call(this, command, ...args);
          void command.promise.then(
            () => {
              span.end();
            },
            () => {
              span.setStatus({ code: SpanStatusCode.ERROR });
              span.end();
            },
          );
          return result;
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.end();
          throw error;
        }
      },
    );
  };
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 아래 apply가 원본 복제 메서드에 실제 수신자를 전달한다
  const duplicate = connection.duplicate;
  connection.duplicate = function (...args) {
    const copy = duplicate.apply(this, args);
    instrumentRedis(copy, tracer);
    return copy;
  };
}
