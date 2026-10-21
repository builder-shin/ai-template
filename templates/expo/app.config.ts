import type { ExpoConfig } from "expo/config";
import identity from "./app-identity.json";
import publicKeys from "./public-env-keys.json";

if (
  Object.keys(process.env).some(
    (key) => key.startsWith("EXPO_PUBLIC_") && !publicKeys.includes(key),
  )
)
  throw new Error("Unsupported public configuration key. Never expose secrets.");

const config: ExpoConfig = {
  name: "name" in identity && typeof identity.name === "string" ? identity.name : "Expo Template",
  slug: "name" in identity && typeof identity.name === "string" ? identity.name : "expo-template",
  version: "1.0.0",
  scheme: identity.scheme,
  platforms: ["ios", "android"],
  userInterfaceStyle: "automatic",
  ios: { bundleIdentifier: identity.iosBundleIdentifier, supportsTablet: true },
  android: { package: identity.androidApplicationId },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-image-picker",
      {
        photosPermission: "Select a profile or post image.",
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    "expo-localization",
    "./plugins/native-network.cjs",
  ],
};
export default config;
