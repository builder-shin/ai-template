import type { ExpoConfig } from "expo/config";
import identity from "./app-identity.json";

const config: ExpoConfig = {
  name: "Expo Template",
  slug: "expo-template",
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
  ],
};
export default config;
