import { afterEach, expect, it, vi } from "vitest";
import pg from "pg";
import { queryObserver } from "../../tests/integration/query-observer.js";

afterEach(() => {
  vi.restoreAllMocks();
});
it("같은 pg query를 두 번 관측해도 원래 수신자와 인자를 한 번만 위임한다", async () => {
  const response = { rows: [{ id: "inserted" }] };
  const original = vi.fn(function (this: pg.Client, ...args: unknown[]) {
    expect(this).toBe(client);
    expect(args).toEqual(["SELECT 1", [1]]);
    return Promise.resolve(response);
  });
  const observeQuery = queryObserver(original as unknown as pg.Client["query"]);
  const observe = () => {
    const { sql, query } = observeQuery();
    vi.spyOn(pg.Client.prototype, "query").mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- pg.query의 callback·Promise 오버로드를 그대로 위임한다
      query,
    );
    return sql;
  };
  const client = new pg.Client();
  // 실제 실패와 같은 순서다: 두 관측기가 같은 prototype을 감싼 뒤 두 번째 연결이 쿼리한다.
  const first = observe();
  const second = observe();
  expect(await client.query("SELECT 1", [1])).toBe(response);
  expect(original).toHaveBeenCalledTimes(1);
  expect(first).toContain("SELECT 1");
  expect(second).toContain("SELECT 1");
});

it("쿼리 관측은 config와 callback 인자와 반환값을 바꾸지 않는다", () => {
  const client = new pg.Client();
  const config = { text: "SELECT $1", values: [1] };
  const callback = vi.fn();
  const result = { rows: [] };
  const forwarded = vi.fn(function (this: pg.Client, ...args: unknown[]) {
    expect(this).toBe(client);
    expect(args).toEqual([config, callback]);
    callback(null, result);
    return result;
  });
  const observe = queryObserver(forwarded as unknown as pg.Client["query"]);
  const { sql, query } = observe();
  expect(Reflect.apply(query, client, [config, callback])).toBe(result);
  expect(sql).toEqual(["SELECT $1"]);
  expect(forwarded).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledExactlyOnceWith(null, result);
});
