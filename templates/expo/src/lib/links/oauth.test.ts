import { OAuthController, OAuthLinkError } from "./oauth";
import type { OAuthPending, PendingStore } from "./pending";
import type { MobileEnv } from "../config/env";
import { deferred } from "../session/test-fixtures";

const env: MobileEnv = {
  apiBaseUrl: "https://api.example.com/api/v1",
  realtimeUrl: "https://api.example.com",
  frontendUrl: "https://app.example.com",
  scheme: "aitpl-example",
  mode: "backend",
};
const verifier = "v".repeat(64);
function fixture(
  existing: OAuthPending | null = null,
  state: { generation?: () => number; authenticated?: () => boolean } = {},
) {
  let value = existing;
  const pending: PendingStore = {
    async read() {
      return value;
    },
    async write(next) {
      value = next;
    },
    async take() {
      const old = value;
      value = null;
      return old;
    },
    async clear() {
      value = null;
    },
  };
  const signIn = jest.fn(async () => {});
  const browser = jest.fn(async (_url: string, _callback: string) => {
    expect(new URL(_url).origin).toBe("https://api.example.com");
    expect(_callback).toBe("aitpl-example://oauth/callback");
    expect(value?.verifier).toBe(verifier);
    return { type: "cancel" } as { type: "cancel" } | { type: "success"; url: string };
  });
  const crypto = { create: jest.fn(async () => ({ verifier, challenge: "c".repeat(43) })) };
  const controller = new OAuthController({
    config: env,
    session: { signIn, ...state },
    pending,
    crypto,
    browser,
    now: () => 1_000_000,
  });
  return { controller, pending, browser, signIn, crypto };
}
describe("native persisted PKCE", () => {
  test.each(["cancel", "generation"])(
    "%s during cryptography cannot persist a verifier or open the browser",
    async (change) => {
      let generation = 1;
      const h = fixture(null, { generation: () => generation });
      const entered = deferred<void>(),
        pair = deferred<{ verifier: string; challenge: string }>();
      h.crypto.create.mockImplementation(async () => {
        entered.resolve();
        return pair.promise;
      });
      const browserEntered = deferred<void>(),
        browserReturned = deferred<{ type: "cancel" }>();
      h.browser.mockImplementation(async () => {
        browserEntered.resolve();
        return browserReturned.promise;
      });
      const completion = h.controller.beginOAuth("google").then(
        () => undefined,
        (error) => error as unknown,
      );
      try {
        await entered.promise;
        if (change === "cancel") await h.controller.cancel();
        else generation++;
        pair.resolve({ verifier, challenge: "c".repeat(43) });
        await Promise.race([browserEntered.promise, completion]);
        expect(await h.pending.read()).toBeNull();
        expect(h.browser).not.toHaveBeenCalled();
      } finally {
        browserReturned.resolve({ type: "cancel" });
        await completion;
      }
    },
  );
  test("starting a new authorization invalidates the previous cold verifier before cryptography", async () => {
    const h = fixture({ provider: "naver", verifier: "old".repeat(22), createdAt: 999000 });
    const entered = deferred<void>(),
      pair = deferred<{ verifier: string; challenge: string }>();
    h.crypto.create.mockImplementation(async () => {
      entered.resolve();
      return pair.promise;
    });
    const completion = h.controller.beginOAuth("google").catch(() => undefined);
    try {
      await entered.promise;
      expect(await h.pending.read()).toBeNull();
    } finally {
      pair.resolve({ verifier, challenge: "c".repeat(43) });
      await completion;
    }
  });
  test("cancellation during a pending write cannot open a browser after that write completes", async () => {
    const h = fixture(),
      entered = deferred<void>(),
      release = deferred<void>();
    const write = h.pending.write.bind(h.pending);
    h.pending.write = async (value) => {
      entered.resolve();
      await release.promise;
      await write(value);
    };
    const completion = h.controller.beginOAuth("google").then(
      () => undefined,
      (error) => error as unknown,
    );
    await entered.promise;
    await h.controller.cancel();
    release.resolve();
    expect(await completion).toBeInstanceOf(OAuthLinkError);
    expect(h.browser).not.toHaveBeenCalled();
    expect(await h.pending.read()).toBeNull();
  });
  test("a session restored during cryptography prevents the obsolete login from opening a browser", async () => {
    let authenticated = false;
    const h = fixture(null, { generation: () => 1, authenticated: () => authenticated });
    const entered = deferred<void>(),
      pair = deferred<{ verifier: string; challenge: string }>();
    h.crypto.create.mockImplementation(async () => {
      entered.resolve();
      return pair.promise;
    });
    const completion = h.controller.beginOAuth("google").then(
      () => undefined,
      (error) => error as unknown,
    );
    await entered.promise;
    authenticated = true;
    pair.resolve({ verifier, challenge: "c".repeat(43) });
    expect(await completion).toBeInstanceOf(OAuthLinkError);
    expect(h.browser).not.toHaveBeenCalled();
    expect(h.signIn).not.toHaveBeenCalled();
    expect(await h.pending.read()).toBeNull();
  });
  test("restoration while the browser is open cannot replace that authenticated account in the same generation", async () => {
    let authenticated = false;
    const h = fixture(null, { generation: () => 1, authenticated: () => authenticated });
    h.browser.mockImplementation(async () => {
      authenticated = true;
      return { type: "success", url: "aitpl-example://oauth/callback?code=late" };
    });
    await expect(h.controller.beginOAuth("google")).rejects.toBeInstanceOf(OAuthLinkError);
    expect(h.signIn).not.toHaveBeenCalled();
    expect(await h.pending.read()).toBeNull();
  });
  test("restoration during verifier consumption cannot replace that account", async () => {
    let authenticated = false;
    const h = fixture(
      { provider: "google", verifier, createdAt: 999000 },
      { generation: () => 1, authenticated: () => authenticated },
    );
    const entered = deferred<void>(),
      release = deferred<void>(),
      take = h.pending.take.bind(h.pending);
    h.pending.take = async () => {
      entered.resolve();
      await release.promise;
      return take();
    };
    const completion = h.controller.finishOAuth("aitpl-example://oauth/callback?code=late").then(
      () => undefined,
      (error) => error as unknown,
    );
    await entered.promise;
    authenticated = true;
    release.resolve();
    expect(await completion).toBeInstanceOf(OAuthLinkError);
    expect(h.signIn).not.toHaveBeenCalled();
  });
  test("cancelled browser response cannot establish a new session", async () => {
    const h = fixture();
    const entered = deferred<void>();
    const returned = deferred<{ type: "success"; url: string }>();
    h.browser.mockImplementation(async () => {
      entered.resolve();
      return returned.promise;
    });
    const begun = h.controller.beginOAuth("google");
    await entered.promise;
    await h.controller.cancel();
    returned.resolve({ type: "success", url: "aitpl-example://oauth/callback?code=a" });
    await expect(begun).rejects.toBeInstanceOf(OAuthLinkError);
    expect(h.signIn).not.toHaveBeenCalled();
  });
  test("cancellation during pending-record consumption blocks the exchange", async () => {
    const h = fixture({ provider: "google", verifier, createdAt: 999_000 });
    const entered = deferred<void>();
    const release = deferred<OAuthPending>();
    h.pending.take = async () => {
      entered.resolve();
      return release.promise;
    };
    const finishing = h.controller.finishOAuth("aitpl-example://oauth/callback?code=a");
    await entered.promise;
    await h.controller.cancel();
    release.resolve({ provider: "google", verifier, createdAt: 999_000 });
    await expect(finishing).rejects.toBeInstanceOf(OAuthLinkError);
    expect(h.signIn).not.toHaveBeenCalled();
  });
  test("browser and Router completion share success after their own sign-in generation changes", async () => {
    let generation = 1;
    const h = fixture(null, { generation: () => generation });
    h.signIn.mockImplementation(async () => {
      generation++;
    });
    const url = "aitpl-example://oauth/callback?code=a";
    h.browser.mockImplementation(async () => ({ type: "success", url }));
    await h.controller.beginOAuth("google");
    await expect(h.controller.finishOAuth(url)).resolves.toBeUndefined();
    expect(h.signIn).toHaveBeenCalledTimes(1);
  });
  test("account generation changes while the browser is open invalidate its pending login", async () => {
    let generation = 1;
    const h = fixture(null, { generation: () => generation });
    h.browser.mockImplementation(async () => {
      generation++;
      return { type: "success", url: "aitpl-example://oauth/callback?code=a" };
    });
    await expect(h.controller.beginOAuth("google")).rejects.toBeInstanceOf(OAuthLinkError);
    expect(h.signIn).not.toHaveBeenCalled();
  });
  test("a stale cold-start callback cannot replace an already authenticated account", async () => {
    const h = fixture(
      { provider: "google", verifier, createdAt: 999_000 },
      { authenticated: () => true },
    );
    await expect(
      h.controller.finishOAuth("aitpl-example://oauth/callback?code=a"),
    ).rejects.toBeInstanceOf(OAuthLinkError);
    expect(h.signIn).not.toHaveBeenCalled();
  });
  test("persists before the browser and clears cancellation", async () => {
    const h = fixture();
    await h.controller.beginOAuth("google");
    expect(h.browser).toHaveBeenCalledTimes(1);
    expect(await h.pending.read()).toBeNull();
    const [url, callback] = h.browser.mock.calls[0]!;
    expect(new URL(url).origin).toBe("https://api.example.com");
    expect(new URL(url).searchParams.get("codeChallenge")).toBe("c".repeat(43));
    expect(callback).toBe("aitpl-example://oauth/callback");
    expect(h.signIn).not.toHaveBeenCalled();
  });
  test("cold start consumes original verifier and duplicate callbacks exchange once", async () => {
    const h = fixture({ provider: "naver", verifier, createdAt: 999_000 });
    const url = "aitpl-example://oauth/callback?code=single-use-code";
    await Promise.all([h.controller.finishOAuth(url), h.controller.finishOAuth(url)]);
    expect(h.signIn).toHaveBeenCalledTimes(1);
    expect(h.signIn).toHaveBeenCalledWith({
      grantType: "oauthCode",
      code: "single-use-code",
      codeVerifier: verifier,
    });
    expect(await h.pending.read()).toBeNull();
  });
  test.each([0, 400_000, 1_000_001])(
    "expired or future pending is erased before exchange (%i)",
    async (createdAt) => {
      const h = fixture({ provider: "kakao", verifier, createdAt });
      await expect(
        h.controller.finishOAuth("aitpl-example://oauth/callback?code=a"),
      ).rejects.toBeInstanceOf(OAuthLinkError);
      expect(h.signIn).not.toHaveBeenCalled();
      expect(await h.pending.read()).toBeNull();
    },
  );
  test("invalid scheme cannot consume the valid pending verifier", async () => {
    const original: OAuthPending = { provider: "google", verifier, createdAt: 999_000 };
    const h = fixture(original);
    await expect(h.controller.finishOAuth("evil://oauth/callback?code=a")).rejects.toBeInstanceOf(
      OAuthLinkError,
    );
    expect(await h.pending.read()).toEqual(original);
    expect(h.signIn).not.toHaveBeenCalled();
  });
});
