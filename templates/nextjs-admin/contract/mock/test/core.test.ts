/**
 * 공통 도구: 시각의 모양, UUID, 레이트 리밋 윈도, 클라이언트 IP, 실시간 허브, 문자열과 목록의 순서.
 * FastAPI 템플릿과 같은 값을 내는지 본다.
 */

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/context.ts";
import { clientOf } from "../src/core/client.ts";
import { formatInstant, HOUR, SECOND, systemClock } from "../src/core/clock.ts";
import { parsePythonUuid, parseUuid, uuid7 } from "../src/core/ids.ts";
import { ordered } from "../src/core/listing.ts";
import { compareText } from "../src/core/permissions.ts";
import { createRateLimiter } from "../src/core/rate-limit.ts";
import { createRealtimeHub, type RealtimeHub } from "../src/core/realtime.ts";
import { checkPassword, digest, hashPassword } from "../src/core/security.ts";
import { testClock } from "./support.ts";

describe("시각", () => {
  it("Pydantic처럼 마이크로초가 있으면 여섯 자리, 없으면 소수 없이 쓴다", () => {
    const start = Date.UTC(2026, 8, 30, 1, 2, 3) * 1000;
    expect(formatInstant(start + 456_789)).toBe("2026-09-30T01:02:03.456789Z");
    expect(formatInstant(start + 120_000)).toBe("2026-09-30T01:02:03.120000Z");
    expect(formatInstant(start)).toBe("2026-09-30T01:02:03Z");
    expect(formatInstant(-12_500_000)).toBe("1969-12-31T23:59:47.500000Z");
  });

  it("시스템 시계는 같은 값을 두 번 주지 않는다", () => {
    const clock = systemClock();
    const values = Array.from({ length: 1000 }, () => clock.now());
    expect(new Set(values).size).toBe(1000);
    expect(values).toEqual(values.toSorted((left, right) => left - right));
  });

  it("벽시계를 따른다: 앞으로 뛰면 그만큼 나아가고, 뒤로 가도 늘어나기만 한다", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const start = Date.UTC(2026, 8, 30, 0, 0, 0);
      vi.setSystemTime(start);
      const clock = systemClock();
      const before = clock.now();

      vi.setSystemTime(start + 60 * 60 * 1000);
      const after = clock.now();
      expect(after).toBe(before + HOUR);

      vi.setSystemTime(start);
      const backward = clock.now();
      expect(backward).toBe(after + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("UUID", () => {
  it("uuid7은 버전 7이고 만든 순서로 커진다", () => {
    const ids = Array.from({ length: 1000 }, () => uuid7());
    const version7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(ids.filter((id) => !version7.test(id))).toEqual([]);
    expect(ids).toEqual(ids.toSorted());
  });

  it.each([
    ["0199a0b2-8c3e-7abc-8def-0123456789ab", "0199a0b2-8c3e-7abc-8def-0123456789ab"],
    ["0199A0B28C3E7ABC8DEF0123456789AB", "0199a0b2-8c3e-7abc-8def-0123456789ab"],
    ["{0199a0b2-8c3e-7abc-8def-0123456789ab}", "0199a0b2-8c3e-7abc-8def-0123456789ab"],
    ["urn:uuid:0199a0b2-8c3e-7abc-8def-0123456789ab", "0199a0b2-8c3e-7abc-8def-0123456789ab"],
    ["0199a0b2-8c3e7abc-8def-0123456789ab", undefined],
    [" 0199a0b2-8c3e-7abc-8def-0123456789ab", undefined],
    ["{0199a0b28c3e7abc8def0123456789ab}", undefined],
    ["urn:uuid:0199a0b28c3e7abc8def0123456789ab", undefined],
  ])("Pydantic처럼 %s를 %s로 읽는다", (value, expected) => {
    expect(parseUuid(value)).toBe(expected);
  });

  // 기대값은 Python 3.14의 uuid.UUID()로 확인했다.
  it.each([
    ["{{0199a0b28c3e7abc8def0123456789ab}}", "0199a0b2-8c3e-7abc-8def-0123456789ab"],
    ["urn:urn:uuid:0199A0B28C3E7ABC8DEF0123456789AB", "0199a0b2-8c3e-7abc-8def-0123456789ab"],
    ["0-1-9-9a0b28c3e7abc8def0123456789ab", "0199a0b2-8c3e-7abc-8def-0123456789ab"],
    ["}0199a0b28c3e7abc8def0123456789ab{", "0199a0b2-8c3e-7abc-8def-0123456789ab"],
    [" 199a0b28c3e7abc8def0123456789ab", "0199a0b2-8c3e-7abc-8def-0123456789ab"],
    ["\u3000199a0b28c3e7abc8def0123456789ab", "0199a0b2-8c3e-7abc-8def-0123456789ab"],
    ["+0x199a0b28c3e7abc8def0123456789", "000199a0-b28c-3e7a-bc8d-ef0123456789"],
    ["0199_0b28c3e7abc8def0123456789ab", "001990b2-8c3e-7abc-8def-0123456789ab"],
    ["\u0661199a0b28c3e7abc8def0123456789ab", "1199a0b2-8c3e-7abc-8def-0123456789ab"],
    ["\u{1d7d9}199a0b28c3e7abc8def0123456789ab", "1199a0b2-8c3e-7abc-8def-0123456789ab"],
    ["0199__b28c3e7abc8def0123456789ab", undefined],
    ["_199a0b28c3e7abc8def0123456789ab", undefined],
    ["-199a0b28c3e7abc8def0123456789ab", undefined],
    ["\u001c199a0b28c3e7abc8def0123456789ab", undefined],
    ["\ufeff199a0b28c3e7abc8def0123456789ab", undefined],
    ["\u00e9199a0b28c3e7abc8def0123456789ab", undefined],
    ["not-a-uuid", undefined],
  ])("Python의 uuid.UUID()처럼 %j를 %s로 읽는다", (value, expected) => {
    expect(parsePythonUuid(value)).toBe(expected);
  });
});

describe("비밀번호와 토큰", () => {
  it("해시한 비밀번호만 맞고, 해시가 없으면 늘 틀리다", () => {
    const hashed = hashPassword("correct-horse"); // betterleaks:allow 테스트용 가짜 비밀번호
    expect(checkPassword("correct-horse", hashed)).toBe(true); // betterleaks:allow 테스트용 가짜 비밀번호
    expect(checkPassword("wrong-horse", hashed)).toBe(false); // betterleaks:allow 테스트용 가짜 비밀번호
    expect(checkPassword("anything", null)).toBe(false);
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("digest는 SHA-256 16진수다", () => {
    expect(digest("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("레이트 리밋", () => {
  it("윈도 안의 한도를 넘으면 남은 초를 반올림해 알리고, 윈도가 끝나면 다시 센다", () => {
    const clock = testClock();
    const limiter = createRateLimiter(clock);
    const limit = { name: "test", limit: 2, window: HOUR };
    expect([limiter.hit(limit, "a"), limiter.hit(limit, "a")]).toEqual([undefined, undefined]);
    clock.advance(HOUR - 90 * SECOND - 400_000);
    expect(limiter.hit(limit, "a")).toBe(90);
    expect(limiter.hit(limit, "b")).toBeUndefined();
    clock.advance(91 * SECOND);
    expect(limiter.hit(limit, "a")).toBeUndefined();
  });

  it("남은 시간이 1초보다 짧아도 1초다", () => {
    const clock = testClock();
    const limiter = createRateLimiter(clock);
    const limit = { name: "test", limit: 1, window: SECOND };
    limiter.hit(limit, "a");
    clock.advance(SECOND - 1000);
    expect(limiter.hit(limit, "a")).toBe(1);
  });
});

describe("클라이언트", () => {
  /** 연결 주소와 헤더로 요청을 보내고 Client를 읽는다. */
  async function clientFor(
    remoteAddress: string | undefined,
    headers: Record<string, string> = {},
  ) {
    const app = new Hono<AppEnv>();
    app.get("/", (c) => c.json(clientOf(c)));
    const env =
      remoteAddress === undefined ? undefined : { incoming: { socket: { remoteAddress } } };
    const response = await app.request("/", { headers }, env);
    return response.json();
  }

  it("연결 주소를 쓰고, IPv6로 감싼 IPv4는 IPv4로 적는다", async () => {
    expect(await clientFor("203.0.113.7")).toEqual({ ip: "203.0.113.7", userAgent: null });
    expect(await clientFor("::ffff:127.0.0.1")).toMatchObject({ ip: "127.0.0.1" });
    expect(await clientFor(undefined)).toMatchObject({ ip: null });
  });

  it("이 PC가 보낸 X-Forwarded-For만 믿고, 뒤에서부터 믿지 않는 첫 주소를 쓴다", async () => {
    const forwarded = { "X-Forwarded-For": "198.51.100.1, 203.0.113.9:8080, 127.0.0.1" };
    expect(await clientFor("127.0.0.1", forwarded)).toMatchObject({ ip: "203.0.113.9" });
    expect(await clientFor("::1", { "X-Forwarded-For": "[2001:db8::1]:443" })).toMatchObject({
      ip: "2001:db8::1",
    });
    expect(await clientFor("127.0.0.1", { "X-Forwarded-For": "::1, 127.0.0.1" })).toMatchObject({
      ip: "::1",
    });
    expect(await clientFor("203.0.113.7", forwarded)).toMatchObject({ ip: "203.0.113.7" });
  });

  it("User-Agent는 500자까지 담고, 비었으면 null이다", async () => {
    const long = "é".repeat(501);
    const client = (await clientFor(undefined, { "User-Agent": long })) as { userAgent: string };
    expect(client.userAgent).toBe("é".repeat(500));
    expect(await clientFor(undefined, { "User-Agent": "" })).toMatchObject({ userAgent: null });
  });
});

describe("실시간 허브", () => {
  function recorded(hub: RealtimeHub): unknown[] {
    const log: unknown[] = [];
    hub.listen({
      event: (event) => log.push(event.name),
      recheck: (userIds) => log.push(["recheck", [...userIds]]),
    });
    return log;
  }

  const event = (name: string) => ({ name, rooms: [], payload: {} });

  it("batch 밖에서는 바로 보낸다", () => {
    const hub = createRealtimeHub();
    const log = recorded(hub);
    hub.publish(event("a"));
    hub.recheck(["u2"]);
    hub.publish(event("b"));
    expect(log).toEqual(["a", ["recheck", ["u2"]], "b"]);
  });

  it("batch는 FastAPI의 commit처럼 이벤트를 차례로 보낸 뒤 재검사를 한 번에 알린다", () => {
    const hub = createRealtimeHub();
    const log = recorded(hub);
    const result = hub.batch(() => {
      hub.publish(event("a"));
      hub.recheck(["u2", "u1"]);
      hub.batch(() => {
        hub.publish(event("b"));
        hub.recheck(["u1", "u3"]);
      });
      expect(log).toEqual([]);
      return "done";
    });
    expect(result).toBe("done");
    expect(log).toEqual(["a", "b", ["recheck", ["u1", "u2", "u3"]]]);
  });

  it("batch가 던지면 모은 것을 버린다(rollback)", () => {
    const hub = createRealtimeHub();
    const log = recorded(hub);
    expect(() =>
      hub.batch(() => {
        hub.publish(event("a"));
        throw new Error("실패");
      }),
    ).toThrow("실패");
    hub.publish(event("b"));
    expect(log).toEqual(["b"]);
  });

  it("비동기 함수는 받지 않는다", () => {
    const hub = createRealtimeHub();
    expect(() => hub.batch(async () => Promise.resolve())).toThrow("동기 함수");
  });
});

describe("문자열과 목록의 순서", () => {
  it("문자열은 코드 포인트 순서다: BMP 밖의 글자가 U+E000–U+FFFF 뒤에 온다", () => {
    const words = ["😀a", "（", "😀", "가", "\u{E000}", "a", ""];
    expect(words.toSorted(compareText)).toEqual(["", "a", "가", "\u{E000}", "（", "😀", "😀a"]);
    expect(["\u{1F601}", "\u{1F600}"].toSorted(compareText)).toEqual(["\u{1F600}", "\u{1F601}"]);
  });

  it("ordered는 문자열을 코드 포인트 순서로, null을 가장 큰 값으로 늘어놓고 같으면 id로 가른다", () => {
    const rows = [
      { id: "3", title: "😀" },
      { id: "1", title: "（" },
      { id: "2", title: null },
      { id: "0", title: "（" },
    ];
    const columns = { title: (row: (typeof rows)[number]) => row.title };
    const ids = (descending: boolean) =>
      ordered(rows, [{ name: "title", descending }], columns, []).map((row) => row.id);
    expect(ids(false)).toEqual(["0", "1", "3", "2"]);
    expect(ids(true)).toEqual(["2", "3", "0", "1"]);
  });
});
