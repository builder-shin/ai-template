import "../lib/i18n";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Providers } from "../lib/providers";
export default function Layout() {
  return (
    <Providers>
      <StatusBar style="auto" />
      <Stack />
    </Providers>
  );
}
