import { readPublicEnv } from "./env";
import { nativeIdentity } from "./identity";
import defaults from "../../../mobile-defaults.json";

describe("native public configuration", () => {
  const release = {
    EXPO_PUBLIC_API_BASE_URL: "https://api.example.com/api/v1",
    EXPO_PUBLIC_REALTIME_URL: "https://api.example.com",
    EXPO_PUBLIC_FRONTEND_URL: "https://app.example.com",
  };
  test("explicit HTTPS release endpoints are accepted", () => {
    expect(readPublicEnv(release, "ios", true).apiBaseUrl).toBe(release.EXPO_PUBLIC_API_BASE_URL);
  });
  test.each([
    ["android", "http://10.0.2.2:4012/api/v1"],
    ["ios", "http://localhost:4012/api/v1"],
  ] as const)("%s uses the tracked platform default", (platform, url) => {
    const configured = defaults[platform] as { apiBaseUrl?: string };
    expect(readPublicEnv({}, platform, false).apiBaseUrl).toBe(configured.apiBaseUrl ?? url);
  });

  test("preserves explicit device endpoints and removes trailing slash", () => {
    expect(
      readPublicEnv(
        { EXPO_PUBLIC_API_BASE_URL: "http://192.168.1.8:8000/api/v1/" },
        "android",
        false,
      ).apiBaseUrl,
    ).toBe("http://192.168.1.8:8000/api/v1");
  });

  test.each([
    "http://api.example.com/api/v1",
    "https://user:pass@api.example.com/api/v1",
    "https://api.example.com/api/v1?token=a",
  ])("rejects unsafe release URL %s", (url) => {
    expect(() =>
      readPublicEnv({ ...release, EXPO_PUBLIC_API_BASE_URL: url }, "ios", true),
    ).toThrow();
  });

  test("requires explicit release endpoints", () => {
    expect(() => readPublicEnv({}, "android", true)).toThrow();
  });

  test("rejects secret-like and unknown public settings without echoing values", () => {
    expect(() =>
      readPublicEnv({ EXPO_PUBLIC_CLIENT_SECRET: "do-not-print" }, "ios", false),
    ).toThrow(/unsupported public/i);
    try {
      readPublicEnv({ EXPO_PUBLIC_CLIENT_SECRET: "do-not-print" }, "ios", false);
    } catch (error) {
      expect(String(error)).not.toContain("do-not-print");
    }
  });

  test("has valid deterministic native identity", () => {
    expect(nativeIdentity("my-app")).toEqual({
      scheme: "aitpl-my-app",
      iosBundleIdentifier: "com.example.my-app",
      androidApplicationId: "com.example.my_app",
    });
    expect(() => nativeIdentity("../wrong")).toThrow();
  });

  test("runtime scheme must match the installed native identity", () => {
    expect(() =>
      readPublicEnv({ EXPO_PUBLIC_APP_SCHEME: "aitpl-unregistered" }, "ios", false),
    ).toThrow(/app-identity/);
  });
});
