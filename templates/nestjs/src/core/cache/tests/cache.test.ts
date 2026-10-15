import { expect, it } from "vitest";
import { z } from "zod";
import type { RedisClients } from "../../redis/clients.js";
import { CacheAside } from "../cache.js";
import { shapeHash } from "../shape.js";
function fixture() {
  const values = new Map<string, string>(),
    expires = new Map<string, number>();
  let now = 0,
    fail = false;
  const cache = new CacheAside({
    prefix: "aitpl:15",
    key: (...parts: string[]) => ["aitpl:15", ...parts].join(":"),
    command: {
      get: (key: string) => {
        if (fail) return Promise.reject(new Error("Redis 단절"));
        if ((expires.get(key) ?? Infinity) <= now) values.delete(key);
        return Promise.resolve(values.get(key) ?? null);
      },
      set: (key: string, value: string, _mode: "EX", ttl: number) => {
        if (fail) return Promise.reject(new Error("Redis 단절"));
        values.set(key, value);
        expires.set(key, now + ttl);
        return Promise.resolve("OK");
      },
      incr: (key: string) => {
        if (fail) return Promise.reject(new Error("Redis 단절"));
        const next = Number(values.get(key) ?? 0) + 1;
        values.set(key, String(next));
        return Promise.resolve(next);
      },
    },
  } as unknown as RedisClients);
  return {
    cache,
    values,
    advance: (seconds: number) => {
      now += seconds;
    },
    disconnect: () => {
      fail = true;
    },
  };
}
it("네임스페이스·세대·모양·키를 격리하고 JSON을 읽는다", async () => {
  const f = fixture();
  await f.cache.set("posts:list", "author", "shape1", { data: [1] }, 60);
  expect(f.values.get("aitpl:15:cache:posts:list:0:shape1:author")).toBe('{"data":[1]}');
  expect(await f.cache.get("posts:list", "author", "shape1")).toEqual({ data: [1] });
  expect(await f.cache.get("posts:list", "author", "shape2")).toBeUndefined();
});
it("bump 뒤에는 옛 세대 값을 읽지 않는다", async () => {
  const f = fixture();
  await f.cache.set("posts:list", "", "shape", { old: true }, 60);
  await f.cache.bump("posts:list");
  expect(await f.cache.get("posts:list", "", "shape")).toBeUndefined();
  await f.cache.set("posts:list", "", "shape", { old: false }, 60);
  expect(await f.cache.get("posts:list", "", "shape")).toEqual({ old: false });
});
it("60초 TTL이 지나면 원본 조회로 돌아간다", async () => {
  const f = fixture();
  await f.cache.set("posts:list", "", "shape", [1], 60);
  f.advance(59);
  expect(await f.cache.get("posts:list", "", "shape")).toEqual([1]);
  f.advance(1);
  expect(await f.cache.get("posts:list", "", "shape")).toBeUndefined();
});
it("Redis 단절은 조회·저장·세대 증가를 막지 않는다", async () => {
  const f = fixture();
  f.disconnect();
  expect(await f.cache.get("posts:list", "", "shape")).toBeUndefined();
  await expect(f.cache.set("posts:list", "", "shape", {}, 60)).resolves.toBeUndefined();
  await expect(f.cache.bump("posts:list")).resolves.toBeUndefined();
});
it("손상된 JSON은 캐시 미스로 처리한다", async () => {
  const f = fixture();
  f.values.set("aitpl:15:cache:posts:list:0:shape:", "{");
  expect(await f.cache.get("posts:list", "", "shape")).toBeUndefined();
});
it("응답 모양 해시는 배포 사이에 안정적이고 모양 변경을 구분한다", () => {
  const a = shapeHash(z.object({ data: z.array(z.string()) }));
  expect(a).toMatch(/^[a-f0-9]{16}$/u);
  expect(shapeHash(z.object({ data: z.array(z.string()) }))).toBe(a);
  expect(shapeHash(z.object({ data: z.array(z.number()) }))).not.toBe(a);
});
it("채우는 중 bump가 일어나면 옛 결과는 옛 세대에만 저장한다", async () => {
  const f = fixture();
  let release!: (value: string) => void, began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const filling = f.cache.remember(
    "posts:list",
    "",
    "shape",
    () => {
      began();
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    },
    60,
  );
  await started;
  await f.cache.bump("posts:list");
  release("옛 응답");
  expect(await filling).toBe("옛 응답");
  expect(await f.cache.get("posts:list", "", "shape")).toBeUndefined();
  expect(
    await f.cache.remember("posts:list", "", "shape", () => Promise.resolve("새 응답"), 60),
  ).toBe("새 응답");
  expect(await f.cache.get("posts:list", "", "shape")).toBe("새 응답");
});
it("Redis 단절 때 loader를 한 번만 실행하고 원본 오류는 전파한다", async () => {
  const f = fixture();
  f.disconnect();
  let calls = 0;
  await expect(
    f.cache.remember(
      "posts:list",
      "",
      "shape",
      () => {
        calls++;
        return Promise.reject(new Error("DB 실패"));
      },
      60,
    ),
  ).rejects.toThrow("DB 실패");
  expect(calls).toBe(1);
});
it("동시 요청은 각각 캡처한 세대로 채우며 서로 간섭하지 않는다", async () => {
  const f = fixture();
  let release!: (value: string) => void, began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const old = f.cache.remember(
    "posts:list",
    "",
    "shape",
    () => {
      began();
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    },
    60,
  );
  await started;
  await f.cache.bump("posts:list");
  await f.cache.remember("posts:list", "", "shape", () => Promise.resolve("현재"), 60);
  release("이전");
  await old;
  expect(await f.cache.get("posts:list", "", "shape")).toBe("현재");
});
it("캐시 직렬화 오류는 Redis 장애로 숨기지 않는다", async () => {
  const f = fixture(),
    circular: { self?: unknown } = {};
  circular.self = circular;
  await expect(f.cache.set("posts:list", "", "shape", circular, 60)).rejects.toBeInstanceOf(
    TypeError,
  );
  await expect(
    f.cache.remember("posts:list", "", "shape", () => Promise.resolve(circular), 60),
  ).rejects.toBeInstanceOf(TypeError);
});
