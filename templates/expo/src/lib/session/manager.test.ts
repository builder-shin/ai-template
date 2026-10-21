import { SessionManager } from "./manager";
import { ApiError } from "../api/errors";
import { deferred, memoryStore, passwordGrant, record, tokens } from "./test-fixtures";

describe("secure session generation and persistence", () => {
  test("overlapping app restorations rotate a stored token once", async () => {
    const entered = deferred<void>();
    const held = deferred<ReturnType<typeof tokens>>();
    const grant = jest.fn(() => {
      entered.resolve();
      return held.promise;
    });
    const store = memoryStore(record("a"));
    const manager = new SessionManager({
      store,
      transport: { grant, revoke: jest.fn(async () => {}) },
    });
    const first = manager.restore();
    await entered.promise;
    const restorations = [first, ...Array.from({ length: 19 }, () => manager.restore())];
    held.resolve(tokens("restored"));
    await Promise.all(restorations);
    expect(grant).toHaveBeenCalledTimes(1);
    expect(manager.snapshot().sessionId).toBe("restored");
  });
  test("401s arriving during the secure rotation write await the same committed credentials", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const store = memoryStore();
    const write = store.write.bind(store);
    store.write = async (value) => {
      if (value.sessionId === "rotated") {
        entered.resolve();
        await release.promise;
      }
      await write(value);
    };
    const grant = jest
      .fn()
      .mockResolvedValueOnce(tokens("a"))
      .mockResolvedValueOnce(tokens("rotated"));
    const manager = new SessionManager({
      store,
      transport: { grant, revoke: jest.fn(async () => {}) },
    });
    await manager.signIn(passwordGrant);
    const old = manager.credentials()!;
    const first = manager.refresh(old);
    await entered.promise;
    const followers = Array.from({ length: 20 }, () => manager.refresh(old));
    release.resolve();
    const results = await Promise.all([first, ...followers]);
    expect(results.every((value) => value?.accessToken === "access-rotated")).toBe(true);
    expect(grant).toHaveBeenCalledTimes(2);
  });
  test("keeps stable snapshots and stores only refresh credentials", async () => {
    const store = memoryStore();
    const manager = new SessionManager({
      store,
      transport: {
        grant: jest.fn().mockResolvedValue(tokens("a")),
        revoke: jest.fn(async () => {}),
      },
    });
    expect(manager.snapshot()).toBe(manager.snapshot());
    await manager.signIn(passwordGrant);
    expect(manager.snapshot().status).toBe("authenticated");
    expect(manager.snapshot()).toBe(manager.snapshot());
    expect(await store.read()).toEqual(record("a"));
    expect(JSON.stringify(store.value)).not.toContain("access-");
  });

  test.each(["logout", "switch"] as const)(
    "late refresh response cannot undo %s",
    async (action) => {
      const held = deferred<ReturnType<typeof tokens>>();
      const grant = jest
        .fn()
        .mockResolvedValueOnce(tokens("a"))
        .mockReturnValueOnce(held.promise)
        .mockResolvedValueOnce(tokens("b"));
      const store = memoryStore();
      const boundary = jest.fn();
      const manager = new SessionManager({
        store,
        transport: { grant, revoke: jest.fn(async () => {}) },
        onBoundary: boundary,
      });
      await manager.signIn(passwordGrant);
      const flight = manager.refresh(manager.credentials()!);
      if (action === "logout") await manager.signOut();
      else await manager.signIn(passwordGrant);
      held.resolve(tokens("a-rotated"));
      await flight;
      expect(manager.snapshot().sessionId).toBe(action === "logout" ? null : "b");
      expect(store.value).toEqual(action === "logout" ? null : record("b"));
      expect(boundary).toHaveBeenCalledTimes(2);
    },
  );

  test.each(["logout", "switch"] as const)(
    "a held SecureStore write is followed by the latest %s state",
    async (action) => {
      const entered = deferred<void>();
      const release = deferred<void>();
      const store = memoryStore();
      const originalWrite = store.write.bind(store);
      store.write = async (value) => {
        if (value.sessionId === "a-rotated") {
          entered.resolve();
          await release.promise;
        }
        await originalWrite(value);
      };
      const grant = jest
        .fn()
        .mockResolvedValueOnce(tokens("a"))
        .mockResolvedValueOnce(tokens("a-rotated"))
        .mockResolvedValueOnce(tokens("b"));
      const manager = new SessionManager({
        store,
        transport: { grant, revoke: jest.fn(async () => {}) },
      });
      await manager.signIn(passwordGrant);
      const flight = manager.refresh(manager.credentials()!);
      await entered.promise;
      const later = action === "logout" ? manager.signOut() : manager.signIn(passwordGrant);
      expect(manager.credentials()).toBeNull();
      release.resolve();
      await Promise.all([flight, later]);
      expect(await store.read()).toEqual(action === "logout" ? null : record("b"));
      expect(manager.snapshot().sessionId).toBe(action === "logout" ? null : "b");
    },
  );

  test("logout during rotation persistence still revokes its session", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const store = memoryStore();
    const write = store.write.bind(store);
    store.write = async (value) => {
      if (value.refreshToken === "refresh-rotated") {
        entered.resolve();
        await release.promise;
      }
      await write(value);
    };
    const rotated = tokens("a");
    rotated.data.attributes.refreshToken = "refresh-rotated";
    const revoke = jest.fn(async () => {});
    const manager = new SessionManager({
      store,
      transport: {
        grant: jest.fn().mockResolvedValueOnce(tokens("a")).mockResolvedValueOnce(rotated),
        revoke,
      },
    });
    await manager.signIn(passwordGrant);
    const refresh = manager.refresh(manager.credentials()!);
    await entered.promise;
    const logout = manager.signOut();
    release.resolve();
    await Promise.all([refresh, logout]);
    expect(revoke).toHaveBeenCalledWith("a", "access-a");
    expect(store.value).toBeNull();
  });

  test("failed rotation persistence cannot reuse the old refresh token", async () => {
    const store = memoryStore();
    const grant = jest
      .fn()
      .mockResolvedValueOnce(tokens("a"))
      .mockResolvedValueOnce(tokens("rotated"));
    const manager = new SessionManager({
      store,
      transport: { grant, revoke: jest.fn(async () => {}) },
    });
    await manager.signIn(passwordGrant);
    const old = manager.credentials()!;
    store.write = async () => {
      throw new Error("sensitive-native-details");
    };
    await expect(manager.refresh(old)).rejects.toThrow("Secure session storage unavailable");
    expect(manager.credentials()).toBeNull();
    expect(store.value).toBeNull();
    expect(await manager.refresh(old)).toBeNull();
    expect(grant).toHaveBeenCalledTimes(2);
  });

  test("offline restore keeps its record, revoked restore erases it", async () => {
    for (const failure of [new TypeError("offline"), new ApiError(401)]) {
      const store = memoryStore(record("a"));
      const manager = new SessionManager({
        store,
        transport: { grant: jest.fn().mockRejectedValue(failure), revoke: jest.fn(async () => {}) },
      });
      await manager.restore();
      expect(manager.snapshot().status).toBe("anonymous");
      expect(manager.snapshot().networkError).toBe(failure instanceof TypeError);
      expect(store.value).toEqual(failure instanceof TypeError ? record("a") : null);
    }
  });

  test("store clear failure stays anonymous and reports no native secret", async () => {
    const store = memoryStore();
    const transport = {
      grant: jest.fn().mockResolvedValue(tokens("a")),
      revoke: jest.fn(async () => {}),
    };
    const manager = new SessionManager({ store, transport });
    await manager.signIn(passwordGrant);
    store.clear = async () => {
      throw new Error("sensitive-native-details");
    };
    await expect(manager.signOut()).rejects.toThrow("Secure session storage unavailable");
    expect(manager.credentials()).toBeNull();
    expect(manager.snapshot().status).toBe("anonymous");
  });
});
