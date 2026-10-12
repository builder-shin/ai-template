import { Logger } from "@nestjs/common";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import type { Server } from "socket.io";
import { RuntimeRealtimePublisher } from "../src/core/realtime/emitter.js";
import type { RedisClients } from "../src/core/redis/clients.js";
import type { PrismaService } from "../src/core/db/prisma.service.js";
import { UnitOfWork } from "../src/core/db/unit-of-work.js";
import type { Tx } from "../src/core/db/unit-of-work.js";

const require = createRequire(import.meta.url);
const { decode } = require(
  require.resolve("notepack.io", { paths: [require.resolve("@socket.io/redis-emitter")] }),
) as { decode: (message: Buffer) => unknown };
const payload = { data: { type: "posts", id: "committed-post" } };

function deferred<T>() {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined;
  let reject: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  if (!resolve || !reject) throw new Error("Promise executor did not initialize.");
  return { promise, resolve, reject };
}

// Drain the event-loop turn, without a timer or elapsed-time wait, before checking settlement.
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

function runtime(publish: (channel: string, message: Buffer) => Promise<number>) {
  const ping = vi.fn(() => Promise.resolve("PONG"));
  const redis = { prefix: "ai-template:db:14", command: { publish }, adapterPublisher: { ping } };
  // The controlled ports intentionally omit connections and unrelated Redis methods.
  const publisher = new RuntimeRealtimePublisher(redis as unknown as RedisClients);
  return { publisher, ping };
}

function transactionHarness(order: string[]) {
  const transaction = vi.fn(async (fn: (tx: Tx) => Promise<unknown>) => {
    order.push("transaction");
    try {
      const value = await fn({} as Tx);
      order.push("commit");
      return value;
    } catch (error) {
      order.push("rollback");
      throw error;
    }
  });
  const uow = new UnitOfWork({ $transaction: transaction } as unknown as PrismaService);
  return { uow, transaction };
}

function queuedHook(publisher: RuntimeRealtimePublisher, name = "post.published") {
  let hook: (() => Promise<void> | void) | undefined;
  publisher.queue(
    (registered) => {
      hook = registered;
    },
    name,
    ["posts"],
    () => payload,
  );
  if (!hook) throw new Error("Expected an after-commit hook.");
  return hook;
}

afterEach(() => vi.restoreAllMocks());

it.each([
  {
    rooms: ["posts", "posts"],
    targets: ["posts"],
    channel: "ai-template:db:14:socket.io#/#posts#",
  },
  {
    rooms: ["posts", "posts:all", "posts"],
    targets: ["posts", "posts:all"],
    channel: "ai-template:db:14:socket.io#/#",
  },
])(
  "awaits actual publication after commit and retains packet/room union $targets",
  async ({ rooms, targets, channel }) => {
    const publication = deferred<number>();
    const started = deferred<undefined>();
    const order: string[] = [];
    const publish = vi.fn<(channel: string, message: Buffer) => Promise<number>>(() => {
      order.push("publish");
      started.resolve(undefined);
      return publication.promise;
    });
    const { publisher, ping } = runtime(publish);
    const { uow, transaction } = transactionHarness(order);
    publisher.observer = (event) => {
      expect(event).toEqual({ name: "post.published", rooms: targets, payload });
      order.push("observer");
    };
    let returned = false;
    const result = { committed: true };
    const operation = uow
      .run((_tx, afterCommit) => {
        publisher.queue(afterCommit, "post.published", rooms, () => {
          order.push("payload");
          return payload;
        });
        return Promise.resolve(result);
      })
      .then((value) => {
        returned = true;
        return value;
      });
    await started.promise;
    await turn();
    try {
      expect(publish).toHaveBeenCalledTimes(1);
      const [actualChannel, message] = publish.mock.calls[0] ?? [];
      expect(actualChannel).toBe(channel);
      expect(message).toBeInstanceOf(Buffer);
      if (!message) throw new Error("Expected the installed emitter's encoded packet.");
      expect(decode(message)).toEqual([
        "emitter",
        { type: 2, data: ["post.published", payload], nsp: "/" },
        { rooms: targets, flags: {}, except: [] },
      ]);
      expect(order).toEqual(["transaction", "commit", "payload", "observer", "publish"]);
      expect(returned).toBe(false);
      expect(ping).not.toHaveBeenCalled();
    } finally {
      publication.resolve(1);
      await operation;
    }
    expect(await operation).toBe(result);
    expect(returned).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(order).not.toContain("rollback");
  },
);

it("propagates actual Redis publication rejection to the registered hook caller", async () => {
  const publication = deferred<number>();
  const started = deferred<undefined>();
  const { publisher } = runtime(() => {
    started.resolve(undefined);
    return publication.promise;
  });
  const error = new Error("Controlled Redis publish rejection");
  const assertion = expect(queuedHook(publisher)()).rejects.toBe(error);
  await started.promise;
  publication.reject(error);
  await assertion;
});

it("contains rejected publication after commit, retains the result and runs later hooks", async () => {
  const publication = deferred<number>();
  const started = deferred<undefined>();
  const order: string[] = [];
  const { publisher } = runtime(() => {
    order.push("publish");
    started.resolve(undefined);
    return publication.promise;
  });
  const { uow, transaction } = transactionHarness(order);
  const logged = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  const result = { committed: true };
  const operation = uow.run((_tx, afterCommit) => {
    publisher.queue(afterCommit, "post.published", ["posts"], () => payload);
    afterCommit(() => {
      order.push("later-hook");
    });
    return Promise.resolve(result);
  });
  await started.promise;
  publication.reject(new Error("Controlled Redis publish rejection"));
  expect(await operation).toBe(result);
  await turn();
  expect(logged).toHaveBeenCalledExactlyOnceWith("After-commit hook failed.");
  expect(order).toEqual(["transaction", "commit", "publish", "later-hook"]);
  expect(transaction).toHaveBeenCalledTimes(1);
  // Vitest's normal unhandled-rejection detection remains enabled.
});

it("tracks overlapping publications independently on the same Redis port", async () => {
  const first = deferred<number>();
  const second = deferred<number>();
  let count = 0;
  const publish = vi.fn<(channel: string, message: Buffer) => Promise<number>>(() => {
    count += 1;
    return count === 1 ? first.promise : second.promise;
  });
  const { publisher } = runtime(publish);
  let firstReturned = false;
  let secondReturned = false;
  const firstOperation = Promise.resolve(queuedHook(publisher)()).then(() => {
    firstReturned = true;
  });
  const secondOperation = Promise.resolve(queuedHook(publisher, "post.updated")()).then(() => {
    secondReturned = true;
  });
  await turn();
  try {
    expect(publish).toHaveBeenCalledTimes(2);
    expect(firstReturned).toBe(false);
    expect(secondReturned).toBe(false);
    first.resolve(1);
    await firstOperation;
    expect(firstReturned).toBe(true);
    expect(secondReturned).toBe(false);
  } finally {
    first.resolve(1);
    second.resolve(1);
    await Promise.all([firstOperation, secondOperation]);
  }
});

it("does not register a hook or evaluate payload/observer for empty rooms", () => {
  const publish = vi.fn(() => Promise.resolve(0));
  const { publisher } = runtime(publish);
  const afterCommit = vi.fn();
  const payloadFn = vi.fn(() => payload);
  const observer = vi.fn();
  publisher.observer = observer;
  publisher.queue(afterCommit, "post.published", [], payloadFn);
  expect(afterCommit).not.toHaveBeenCalled();
  expect(payloadFn).not.toHaveBeenCalled();
  expect(observer).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});

it("awaits payload construction before observing and publishing", async () => {
  const constructed = deferred<typeof payload>();
  const publish = vi.fn(() => Promise.resolve(1));
  const { publisher } = runtime(publish);
  const observer = vi.fn();
  publisher.observer = observer;
  let hook: (() => Promise<void> | void) | undefined;
  publisher.queue(
    (registered) => {
      hook = registered;
    },
    "post.published",
    ["posts"],
    () => constructed.promise,
  );
  if (!hook) throw new Error("Expected an after-commit hook.");
  const operation = hook();
  await turn();
  expect(publish).not.toHaveBeenCalled();
  expect(observer).not.toHaveBeenCalled();
  constructed.resolve(payload);
  await operation;
  expect(observer).toHaveBeenCalledExactlyOnceWith({
    name: "post.published",
    rooms: ["posts"],
    payload,
  });
  expect(publish).toHaveBeenCalledTimes(1);
});

it("retains server emission and awaits the existing adapter ping without worker publication", async () => {
  const confirmation = deferred<string>();
  const publish = vi.fn(() => Promise.resolve(1));
  const { publisher, ping } = runtime(publish);
  ping.mockImplementation(() => confirmation.promise);
  const emit = vi.fn(() => true);
  const to = vi.fn(() => ({ emit }));
  publisher.server = { to } as unknown as Server;
  let returned = false;
  const operation = Promise.resolve(queuedHook(publisher)()).then(() => {
    returned = true;
  });
  await turn();
  try {
    expect(to).toHaveBeenCalledExactlyOnceWith(["posts"]);
    expect(emit).toHaveBeenCalledExactlyOnceWith("post.published", payload);
    expect(ping).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
    expect(returned).toBe(false);
  } finally {
    confirmation.resolve("PONG");
    await operation;
  }
  expect(returned).toBe(true);
});
