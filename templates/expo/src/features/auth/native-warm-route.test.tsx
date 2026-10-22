import { Stack } from "expo-router";
import { act, cleanup, renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";
import * as nativeIntent from "../../app/+native-intent";
import { readPublicEnv } from "../../lib/config/env";

jest.mock("../../lib/config/runtime", () => ({
  runtimeConfig: () => jest.requireActual("../../lib/config/env").readPublicEnv({}, "ios", false),
}));

test("the actual Router returns from sessions to home through the fixture launcher root link", async () => {
  const linkingModule = jest.requireMock<typeof import("expo-linking")>("expo-linking");
  const listeners = new Set<(event: { url: string }) => void>();
  jest.spyOn(linkingModule, "addEventListener").mockImplementation((_type, listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  });
  try {
    const result = await renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        "+native-intent": nativeIntent,
        index: () => <Text>Native root destination</Text>,
        "me/sessions": () => <Text>Current session</Text>,
      },
      { initialUrl: "/me/sessions" },
    );
    expect(await screen.findByText("Current session")).toBeTruthy();
    expect(listeners.size).toBeGreaterThan(0);
    const { scheme } = readPublicEnv({}, "ios", false);
    const link = `${scheme}://expo-development-client/?${new URLSearchParams({
      url: "http://127.0.0.1:8082",
      aitpl_link: `${scheme}://`,
    })}`;
    await act(async () => {
      for (const listener of listeners) await listener({ url: link });
    });
    expect(await screen.findByText("Native root destination")).toBeTruthy();
    expect(result.getPathname()).toBe("/");
  } finally {
    await cleanup();
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
});
