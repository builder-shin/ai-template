import { createPendingStore, PendingStorageError } from "./pending";

describe("native handoff record storage", () => {
  const record = { provider: "google" as const, verifier: "v".repeat(64), createdAt: 1000 };
  test("concurrent cold callbacks take one secure record exactly once", async () => {
    let value: string | null = JSON.stringify(record);
    const native = {
      async getItemAsync() {
        return value;
      },
      async setItemAsync(_key: string, next: string) {
        value = next;
      },
      async deleteItemAsync() {
        value = null;
      },
    };
    const store = createPendingStore(native);
    const results = await Promise.all(Array.from({ length: 20 }, () => store.take()));
    expect(results.filter(Boolean)).toEqual([record]);
    expect(value).toBeNull();
  });
  test("malformed pending data is erased", async () => {
    const native = {
      getItemAsync: jest.fn(async () => "{"),
      setItemAsync: jest.fn(async () => {}),
      deleteItemAsync: jest.fn(async () => {}),
    };
    expect(await createPendingStore(native).read()).toBeNull();
    expect(native.deleteItemAsync).toHaveBeenCalledTimes(1);
  });
  test("native storage errors never disclose native contents", async () => {
    const native = {
      getItemAsync: jest.fn(async () => null),
      setItemAsync: jest.fn(async () => {
        throw new Error("native-sensitive-error");
      }),
      deleteItemAsync: jest.fn(async () => {}),
    };
    await expect(createPendingStore(native).write(record)).rejects.toBeInstanceOf(
      PendingStorageError,
    );
    await expect(createPendingStore(native).write(record)).rejects.not.toThrow(
      "native-sensitive-error",
    );
  });
});
