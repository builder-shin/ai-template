export interface MobileEnv {
  apiBaseUrl: string;
  realtimeUrl: string;
  frontendUrl: string;
  scheme: string;
  mode: "mock" | "backend";
}

const keys = ["API_BASE_URL", "REALTIME_URL", "FRONTEND_URL", "APP_SCHEME", "API_MODE"].map(
  (key) => `EXPO_PUBLIC_${key}`,
);

function endpoint(value: string, key: string, release: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key}: invalid URL.`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    (release && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      `${key}: use an ${release ? "HTTPS" : "HTTP(S)"} URL without credentials, query or fragment.`,
    );
  return url.toString().replace(/\/$/, "");
}

export function readPublicEnv(
  input: Record<string, string | undefined>,
  platform: "android" | "ios",
  release: boolean,
): MobileEnv {
  if (Object.keys(input).some((key) => key.startsWith("EXPO_PUBLIC_") && !keys.includes(key)))
    throw new Error("Unsupported public configuration key. Never expose secrets.");
  const host = platform === "android" ? "10.0.2.2" : "localhost";
  if (
    release &&
    (!input.EXPO_PUBLIC_API_BASE_URL ||
      !input.EXPO_PUBLIC_REALTIME_URL ||
      !input.EXPO_PUBLIC_FRONTEND_URL)
  )
    throw new Error("Release requires explicit HTTPS API, realtime and frontend URLs.");
  const apiBaseUrl = endpoint(
    input.EXPO_PUBLIC_API_BASE_URL ?? `http://${host}:4012/api/v1`,
    "API_BASE_URL",
    release,
  );
  if (!new URL(apiBaseUrl).pathname.endsWith("/api/v1"))
    throw new Error("API_BASE_URL: end the path with /api/v1.");
  const scheme = input.EXPO_PUBLIC_APP_SCHEME ?? "aitpl-expo-template";
  if (
    !/^[a-z][a-z0-9-]{2,63}$/.test(scheme) ||
    ["http", "https", "exp", "exps", "file", "javascript", "data"].includes(scheme)
  )
    throw new Error("APP_SCHEME: use a private lower-case app scheme.");
  const mode = input.EXPO_PUBLIC_API_MODE ?? "mock";
  if (mode !== "mock" && mode !== "backend") throw new Error("API_MODE: choose mock or backend.");
  return {
    apiBaseUrl,
    realtimeUrl: endpoint(
      input.EXPO_PUBLIC_REALTIME_URL ?? new URL(apiBaseUrl).origin,
      "REALTIME_URL",
      release,
    ),
    frontendUrl: endpoint(
      input.EXPO_PUBLIC_FRONTEND_URL ?? "http://localhost:3000",
      "FRONTEND_URL",
      release,
    ),
    scheme,
    mode,
  };
}
