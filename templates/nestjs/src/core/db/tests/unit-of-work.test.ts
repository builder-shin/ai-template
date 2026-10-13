import { Logger } from "@nestjs/common";
import { afterEach, expect, it, vi } from "vitest";
import { UnitOfWork, type UnitOfWorkOptions } from "../unit-of-work.js";

function fixture(order: string[]) {
  const tx = { marker: "같은 트랜잭션" };
  const transaction = vi.fn<
    (fn: (value: typeof tx) => Promise<unknown>, options?: UnitOfWorkOptions) => Promise<unknown>
  >(async (fn) => {
    order.push("transaction");
    try {
      const result = await fn(tx);
      order.push("commit");
      return result;
    } catch (error) {
      order.push("rollback");
      throw error;
    }
  });
  return { uow: new UnitOfWork({ $transaction: transaction } as never), tx, transaction };
}
afterEach(() => vi.restoreAllMocks());
it("commit 뒤에 훅을 등록 순서대로 기다린다", async () => {
  const order: string[] = [];
  const { uow, tx } = fixture(order);
  const result = await uow.run(async (actual, afterCommit) => {
    expect(actual).toBe(tx);
    afterCommit(async () => {
      await Promise.resolve();
      order.push("a");
    });
    afterCommit(() => {
      order.push("b");
    });
    return Promise.resolve(7);
  });
  expect(result).toBe(7);
  expect(order).toEqual(["transaction", "commit", "a", "b"]);
});
it("rollback하면 훅을 버리고 원래 오류를 돌려준다", async () => {
  const order: string[] = [];
  const error = new Error("쓰기 실패");
  await expect(
    fixture(order).uow.run(async (_tx, afterCommit) => {
      afterCommit(() => {
        order.push("실행하면 안 된다");
      });
      await Promise.resolve();
      throw error;
    }),
  ).rejects.toBe(error);
  expect(order).toEqual(["transaction", "rollback"]);
});
it("훅이 실패해도 결과를 돌려주고 다음 훅을 실행한다", async () => {
  const order: string[] = [];
  const error = new Error("발행 실패");
  const logged = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  const result = await fixture(order).uow.run(async (_tx, afterCommit) => {
    afterCommit(() => {
      throw error;
    });
    afterCommit(() => {
      order.push("다음 훅");
    });
    return Promise.resolve("저장 결과");
  });
  expect(result).toBe("저장 결과");
  expect(order).toEqual(["transaction", "commit", "다음 훅"]);
  expect(logged).toHaveBeenCalledExactlyOnceWith("After-commit hook failed.", error);
});
it("격리 수준과 시간 제한을 트랜잭션에 전달한다", async () => {
  const { uow, transaction } = fixture([]);
  const options = { isolationLevel: "RepeatableRead" as const, timeout: 7000, maxWait: 1500 };
  await uow.run(async () => Promise.resolve(1), options);
  expect(transaction.mock.calls[0]?.[1]).toEqual(options);
});
it("겹치는 실행의 훅을 서로 섞지 않는다", async () => {
  const order: string[] = [];
  const { uow } = fixture(order);
  await Promise.all([
    uow.run(async (_tx, afterCommit) => {
      afterCommit(() => {
        order.push("첫 훅");
      });
      return Promise.resolve(1);
    }),
    uow.run(async (_tx, afterCommit) => {
      afterCommit(() => {
        order.push("둘째 훅");
      });
      return Promise.resolve(2);
    }),
  ]);
  expect(order.filter((value) => value.endsWith("훅"))).toEqual(["첫 훅", "둘째 훅"]);
});
