import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import type { MobileEnv } from "../config/env";
import type { SessionManager } from "../session/manager";
import { OAuthController } from "./oauth";
import { createPendingStore } from "./pending";

export function createNativeOAuth(config: MobileEnv, session: SessionManager) {
  return new OAuthController({
    config,
    session: {
      signIn: session.signIn.bind(session),
      generation: session.generation,
      authenticated: () => session.snapshot().status === "authenticated",
    },
    pending: createPendingStore(),
    crypto: {
      async create() {
        const bytes = await Crypto.getRandomBytesAsync(32);
        const verifier = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
        const digest = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          verifier,
          { encoding: Crypto.CryptoEncoding.BASE64 },
        );
        return {
          verifier,
          challenge: digest.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""),
        };
      },
    },
    async browser(url, callback) {
      if (
        AuthSession.makeRedirectUri({
          native: callback,
          scheme: config.scheme,
          path: "oauth/callback",
        }) !== callback
      )
        throw new Error("Use a development build with the configured app scheme.");
      const result = await WebBrowser.openAuthSessionAsync(url, callback, {
        preferEphemeralSession: true,
      });
      return result.type === "success" ? { type: "success", url: result.url } : { type: "cancel" };
    },
  });
}
