import { createRequire } from "node:module";
import { Logger } from "@nestjs/common";
import type { Server } from "socket.io";
import { afterEach, expect, it, vi } from "vitest";
import { UnitOfWork, type AfterCommit, type Tx } from "../../db/unit-of-work.js";
import type { PrismaService } from "../../db/prisma.service.js";
import type { RedisClients } from "../../redis/clients.js";
import { RealtimeEmitter } from "../emitter.js";
import { RuntimeRealtimePublisher } from "../publisher.js";
import { deferred } from "./deferred.js";
const require = createRequire(import.meta.url);
const msgpack = createRequire(require.resolve("@socket.io/redis-emitter"))("notepack.io") as {
  decode(value: Buffer): unknown;
};
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const order: string[] = [];
  const pending: ReturnType<typeof deferred<number>>[] = [];
  const packets: { channel: string; message: Buffer }[] = [];
  const redis = {
    prefix: "aitpl:15",
    adapterPublisher: {
      publish: (channel: string, message: Buffer) => {
        order.push("publish");
        packets.push({ channel, message });
        const p = deferred<number>();
        pending.push(p);
        return p.promise;
      },
      ping: () => {
        order.push("ping");
        const p = deferred<number>();
        pending.push(p);
        return p.promise;
      },
    },
  } as unknown as RedisClients;
  const unit = new UnitOfWork({
    $transaction: async (fn: (tx: Tx) => Promise<unknown>) => {
      const result = await fn({} as Tx);
      order.push("commit");
      return result;
    },
  } as unknown as PrismaService);
  return { publisher: new RuntimeRealtimePublisher(redis), unit, redis, order, pending, packets };
}
async function turns() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
it("commit 뒤 payload를 평가하고 발행 완료 뒤 observer를 실행한다", async () => {
  const f = fixture();
  let returned = false;
  const result = f.unit
    .run((_tx, afterCommit) => {
      f.publisher.queue(afterCommit, "post.created", ["posts"], () => {
        f.order.push("payload");
        return { data: "저장 결과" };
      });
      afterCommit(() => {
        f.order.push("observer");
      });
      return Promise.resolve(7);
    })
    .then((value) => {
      returned = true;
      return value;
    });
  await turns();
  expect(f.order).toEqual(["commit", "payload", "publish"]);
  expect(returned).toBe(false);
  f.pending[0]?.resolve(1);
  expect(await result).toBe(7);
  expect(f.order).toEqual(["commit", "payload", "publish", "observer"]);
  expect(f.packets[0]?.channel).toBe("aitpl:15:socket.io#/#posts#");
  expect(msgpack.decode(f.packets[0]?.message ?? Buffer.alloc(0))).toEqual([
    "emitter",
    { type: 2, data: ["post.created", { data: "저장 결과" }], nsp: "/" },
    { rooms: ["posts"], flags: {}, except: [] },
  ]);
});
it("직접 emitter 발행의 Redis 거절을 호출자에게 전파한다", async () => {
  const f = fixture();
  const failure = new Error("발행 거절");
  const result = new RealtimeEmitter(f.redis.adapterPublisher, "aitpl:15")
    .publish("post.created", ["posts"], {})
    .then(
      () => undefined,
      (error: unknown) => error,
    );
  await turns();
  f.pending[0]?.reject(failure);
  expect(await result).toBe(failure);
  expect(f.pending).toHaveLength(1);
});
it("발행 거절을 UnitOfWork가 포함하고 저장 결과와 뒤 훅을 보존한다", async () => {
  const f = fixture();
  const failure = new Error("발행 거절");
  const logged = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
  const result = f.unit.run((_tx, afterCommit) => {
    f.publisher.queue(afterCommit, "post.updated", ["posts"], () => ({}));
    afterCommit(() => {
      f.order.push("observer");
    });
    return Promise.resolve("저장 결과");
  });
  await turns();
  expect(f.pending).toHaveLength(1);
  f.pending[0]?.reject(failure);
  expect(await result).toBe("저장 결과");
  expect(f.order).toEqual(["commit", "publish", "observer"]);
  expect(logged).toHaveBeenCalledWith("After-commit hook failed.", failure);
});
it("겹친 emitter 발행은 각 Promise의 완료를 따로 기다린다", async () => {
  const f = fixture();
  const emitter = new RealtimeEmitter(f.redis.adapterPublisher, "aitpl:15");
  const finished: string[] = [];
  const a = emitter.publish("post.created", ["posts", "posts:all"], { id: "a" }).then(() => {
    finished.push("a");
  });
  const b = emitter.publish("post.updated", ["posts"], { id: "b" }).then(() => {
    finished.push("b");
  });
  await turns();
  expect(f.pending).toHaveLength(2);
  f.pending[1]?.resolve(1);
  await b;
  expect(finished).toEqual(["b"]);
  f.pending[0]?.resolve(1);
  await a;
  expect(finished).toEqual(["b", "a"]);
  expect(f.packets[0]?.channel).toBe("aitpl:15:socket.io#/#");
  expect(msgpack.decode(f.packets[0]?.message ?? Buffer.alloc(0))).toEqual([
    "emitter",
    { type: 2, data: ["post.created", { id: "a" }], nsp: "/" },
    { rooms: ["posts", "posts:all"], flags: {}, except: [] },
  ]);
});
it("빈 룸에는 훅을 등록하지 않고 payload도 평가하지 않는다", () => {
  const f = fixture();
  let evaluated = false;
  const hooks: unknown[] = [];
  f.publisher.queue(
    (h) => {
      hooks.push(h);
    },
    "post.created",
    [],
    () => {
      evaluated = true;
    },
  );
  expect(hooks).toEqual([]);
  expect(evaluated).toBe(false);
  expect(f.packets).toEqual([]);
});
it("비동기 payload가 끝난 다음 실제 값을 인코딩한다", async () => {
  const f = fixture();
  const payload = deferred<object>();
  const hooks: (() => Promise<void> | void)[] = [];
  f.publisher.queue(
    (h) => {
      hooks.push(h);
    },
    "post.updated",
    ["posts"],
    () => payload.promise,
  );
  expect(hooks).toHaveLength(1);
  const result = hooks[0]?.();
  await turns();
  expect(f.packets).toEqual([]);
  payload.resolve({ data: "완료" });
  await turns();
  expect(f.packets).toHaveLength(1);
  f.pending[0]?.resolve(1);
  await result;
  expect(msgpack.decode(f.packets[0]?.message ?? Buffer.alloc(0))).toEqual([
    "emitter",
    { type: 2, data: ["post.updated", { data: "완료" }], nsp: "/" },
    { rooms: ["posts"], flags: {}, except: [] },
  ]);
});
it("api는 룸으로 emit한 뒤 같은 publisher의 ping 완료를 기다린다", async () => {
  const f = fixture();
  const hooks: (() => Promise<void> | void)[] = [];
  let actual: unknown;
  f.publisher.bind({
    to: (rooms: string[]) => ({
      emit: (name: string, payload: unknown) => {
        actual = { rooms, name, payload };
        f.order.push("emit");
      },
    }),
  } as unknown as Server);
  f.publisher.queue(
    (h) => {
      hooks.push(h);
    },
    "session.revoked",
    ["user:u"],
    () => ({ meta: { reason: "logout" } }),
  );
  expect(hooks).toHaveLength(1);
  let done = false;
  const result = Promise.resolve(hooks[0]?.()).then(() => {
    done = true;
  });
  await turns();
  expect(actual).toEqual({
    rooms: ["user:u"],
    name: "session.revoked",
    payload: { meta: { reason: "logout" } },
  });
  expect(f.order).toEqual(["emit", "ping"]);
  expect(done).toBe(false);
  f.pending[0]?.resolve(1);
  await result;
});
it("rollback하면 실제 emitter 발행과 payload를 모두 버린다", async () => {
  const f = fixture();
  let evaluated = false;
  const failure = new Error("저장 실패");
  await expect(
    f.unit.run((_tx, afterCommit: AfterCommit) => {
      f.publisher.queue(afterCommit, "post.created", ["posts"], () => {
        evaluated = true;
      });
      return Promise.reject(failure);
    }),
  ).rejects.toBe(failure);
  expect(evaluated).toBe(false);
  expect(f.packets).toEqual([]);
});
