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
  const controller = new OAuthController({
    config: env,
    session: { signIn, ...state },
    pending,
    crypto: {
      async create() {
        return { verifier, challenge: "c".repeat(43) };
      },
    },
    browser,
    now: () => 1_000_000,
  });
  return { controller, pending, browser, signIn };
}
describe("native persisted PKCE", () => {
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
