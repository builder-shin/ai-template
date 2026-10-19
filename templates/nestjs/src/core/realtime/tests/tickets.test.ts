import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { TicketStore } from "../tickets.js";
import type { RedisClients } from "../../redis/clients.js";
import type { Principal } from "../../security/principal.js";
const principal: Principal = {
  userId: "u",
  sessionId: "s",
  permissions: new Set(["posts:manage"]),
};
function ticketFixture() {
  let now = 0;
  const values = new Map<string, { value: string; until: number }>();
  const writes: { key: string; value: string; ttl: number }[] = [];
  const redis = {
    prefix: "aitpl:15",
    command: {
      set: (key: string, value: string, mode: string, ttl: number) => {
        if (mode !== "EX") throw new Error("초 단위 만료가 아니다");
        values.set(key, { value, until: now + ttl * 1000 });
        writes.push({ key, value, ttl });
        return Promise.resolve("OK");
      },
      getdel: (key: string) => {
        const row = values.get(key);
        values.delete(key);
        return Promise.resolve(row && row.until > now ? row.value : null);
      },
    },
  } as unknown as RedisClients;
  return {
    store: new TicketStore(redis),
    writes,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
it("무작위 티켓의 다이제스트만 키에 쓰고 30초 저장한다", async () => {
  const f = ticketFixture();
  const token = await f.store.issue(principal);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(f.writes).toEqual([
    {
      key: "aitpl:15:realtime:ticket:" + createHash("sha256").update(token).digest("hex"),
      value: JSON.stringify({ userId: "u", sessionId: "s", permissions: ["posts:manage"] }),
      ttl: 30,
    },
  ]);
  expect(await f.store.issue(principal)).not.toBe(token);
});
it("GETDEL로 같은 티켓을 한 번만 소비하고 권한을 복원한다", async () => {
  const f = ticketFixture();
  const token = await f.store.issue(principal);
  const results = await Promise.all([f.store.consume(token), f.store.consume(token)]);
  expect(results).toEqual([principal, undefined]);
});
it("30초가 지나거나 모르는 티켓이면 인증 주체가 없다", async () => {
  const f = ticketFixture();
  const token = await f.store.issue(principal);
  f.advance(30000);
  expect(await f.store.consume(token)).toBeUndefined();
  expect(await f.store.consume("없는 티켓")).toBeUndefined();
});
