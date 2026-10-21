import type { MobileEnv } from "../config/env";
import type { SessionGrant } from "../session/types";
import { parseAppLink } from "./parse";
import type { OAuthPending, PendingStore } from "./pending";

interface Options {
  config: MobileEnv;
  session: {
    signIn(grant: SessionGrant): Promise<void>;
    generation?(): number;
    authenticated?(): boolean;
  };
  pending: PendingStore;
  crypto: { create(): Promise<{ verifier: string; challenge: string }> };
  browser(
    url: string,
    callback: string,
  ): Promise<{ type: "success"; url: string } | { type: "cancel" | "dismiss" | "locked" }>;
  now?: () => number;
}
export class OAuthLinkError extends Error {
  constructor(readonly code = "auth.oauth_failed") {
    super("Authentication link could not be completed. Please start again.");
  }
}
export class OAuthController {
  #busy = false;
  #finishing = false;
  #cancelled = false;
  #started = false;
  #launchGeneration: number | undefined;
  #completion: { value: string; promise: Promise<void> } | undefined;
  constructor(private readonly options: Options) {}
  async beginOAuth(provider: OAuthPending["provider"]): Promise<void> {
    if (this.#busy || this.#finishing || !["google", "kakao", "naver"].includes(provider))
      throw new OAuthLinkError();
    this.#busy = true;
    this.#cancelled = false;
    this.#started = true;
    this.#launchGeneration = this.options.session.generation?.();
    this.#completion = undefined;
    let pending: OAuthPending | undefined;
    try {
      const pair = await this.options.crypto.create();
      if (
        !/^[A-Za-z0-9._~-]{43,128}$/.test(pair.verifier) ||
        !/^[A-Za-z0-9_-]{43}$/.test(pair.challenge)
      )
        throw new OAuthLinkError();
      pending = { provider, verifier: pair.verifier, createdAt: (this.options.now ?? Date.now)() };
      await this.options.pending.write(pending);
      const callback = `${this.options.config.scheme}://oauth/callback`;
      const url = new URL(`${this.options.config.apiBaseUrl}/oauth/${provider}/authorize`);
      url.searchParams.set("redirectUri", callback);
      url.searchParams.set("codeChallenge", pair.challenge);
      const result = await this.options.browser(url.toString(), callback);
      if (result.type === "success") await this.finishOAuth(result.url);
    } finally {
      try {
        if (pending) await this.options.pending.clear(pending.verifier);
      } finally {
        this.#busy = false;
      }
    }
  }
  finishOAuth(url: string): Promise<void> {
    const link = parseAppLink(url, this.options.config);
    if (!link || link.kind !== "oauth") return Promise.reject(new OAuthLinkError());
    if (this.#completion?.value === link.value) return this.#completion.promise;
    if (
      this.#cancelled ||
      (this.#launchGeneration !== undefined &&
        this.#launchGeneration !== this.options.session.generation?.()) ||
      (!this.#started && this.options.session.authenticated?.())
    ) {
      this.#cancelled = true;
      return this.options.pending.clear().then(() => {
        throw new OAuthLinkError();
      });
    }
    if (this.#finishing) return Promise.reject(new OAuthLinkError());
    this.#finishing = true;
    const promise = this.#finish(link.value);
    this.#completion = { value: link.value, promise };
    void promise
      .finally(() => {
        this.#finishing = false;
      })
      .catch(() => undefined);
    return promise;
  }
  cancel(): Promise<void> {
    this.#cancelled = true;
    return this.options.pending.clear();
  }
  async #finish(value: string): Promise<void> {
    const generation = this.options.session.generation?.();
    const pending = await this.options.pending.take();
    if (this.#cancelled || generation !== this.options.session.generation?.())
      throw new OAuthLinkError();
    const age = (this.options.now ?? Date.now)() - (pending?.createdAt ?? 0);
    if (!pending || age < 0 || age >= 10 * 60_000) throw new OAuthLinkError();
    if (value.startsWith("auth.")) throw new OAuthLinkError(value);
    await this.options.session.signIn({
      grantType: "oauthCode",
      code: value,
      codeVerifier: pending.verifier,
    });
  }
}
