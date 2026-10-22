import { Platform } from "react-native";
import { readPublicEnv } from "./env";

// Metro replaces static property reads only. Keep all public keys explicit.
export function runtimeConfig() {
  if (Platform.OS !== "android" && Platform.OS !== "ios")
    throw new Error("Use a native iOS or Android build.");
  return readPublicEnv(
    {
      EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
      EXPO_PUBLIC_REALTIME_URL: process.env.EXPO_PUBLIC_REALTIME_URL,
      EXPO_PUBLIC_FRONTEND_URL: process.env.EXPO_PUBLIC_FRONTEND_URL,
      EXPO_PUBLIC_APP_SCHEME: process.env.EXPO_PUBLIC_APP_SCHEME,
      EXPO_PUBLIC_API_MODE: process.env.EXPO_PUBLIC_API_MODE,
    },
    Platform.OS,
    !__DEV__,
  );
}
