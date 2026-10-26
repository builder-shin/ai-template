import { createSessionStore, parseStoredSession } from "./store";
import { record } from "./test-fixtures";

describe("secure record boundary", () => {
  test.each([
    "{",
    "{}",
    JSON.stringify({ ...record("a"), accessToken: "forbidden" }),
    JSON.stringify({ ...record("a"), refreshTokenExpiresAt: "2000-01-01" }),
  ])("rejects malformed, expired, or access-token-bearing records", (raw) => {
    expect(parseStoredSession(raw)).toBeNull();
  });
  test("uses one native secure record with device-only accessibility", async () => {
    const native = {
      getItemAsync: jest.fn().mockResolvedValue(JSON.stringify(record("a"))),
      setItemAsync: jest.fn(),
      deleteItemAsync: jest.fn(),
    };
    const store = createSessionStore(native);
    expect(await store.read()).toEqual(record("a"));
    await store.write(record("b"));
    await store.clear();
    expect(native.setItemAsync).toHaveBeenCalledTimes(1);
    expect(JSON.parse(native.setItemAsync.mock.calls[0]![1] as string)).toEqual(record("b"));
    expect(native.deleteItemAsync.mock.calls[0]![0]).toBe(native.getItemAsync.mock.calls[0]![0]);
  });
});
