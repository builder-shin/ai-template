import { createNativeOAuth } from "./native";
import { readPublicEnv } from "../config/env";
import { SessionManager } from "../session/manager";
import { memoryStore, tokens } from "../session/test-fixtures";
import * as WebBrowser from "expo-web-browser";

jest.mock("expo-constants", () => {
  const identity = jest.requireActual("../../../app-identity.json") as { scheme: string };
  return {
    __esModule: true,
    default: {
      executionEnvironment: "bare",
      expoConfig: { scheme: identity.scheme, hostUri: "127.0.0.1:8082" },
      linkingUri: identity.scheme + "://",
    },
    ExecutionEnvironment: { Bare: "bare", Standalone: "standalone", StoreClient: "storeClient" },
  };
});
jest.mock("expo-crypto", () => ({
  getRandomBytesAsync: async () => new Uint8Array(32),
  digestStringAsync: async () => "A".repeat(43) + "=",
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  CryptoEncoding: { BASE64: "base64" },
}));
test("a native development manifest host cannot change the private OAuth callback", async () => {
  const browser = jest
    .spyOn(WebBrowser, "openAuthSessionAsync")
    .mockResolvedValue({ type: WebBrowser.WebBrowserResultType.CANCEL });
  const manager = new SessionManager({
    store: memoryStore(),
    transport: { grant: async () => tokens("native"), revoke: async () => {} },
  });
  const config = readPublicEnv({}, "ios", false);
  const controller = createNativeOAuth(config, manager);
  try {
    await expect(controller.beginOAuth("google")).resolves.toBeUndefined();
    expect(browser).toHaveBeenCalledWith(
      expect.any(String),
      config.scheme + "://oauth/callback",
      expect.any(Object),
    );
  } finally {
    browser.mockRestore();
  }
});
