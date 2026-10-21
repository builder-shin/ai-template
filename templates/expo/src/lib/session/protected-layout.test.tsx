import { renderRouter, screen, act } from "expo-router/testing-library";
import { Stack, router } from "expo-router";
import { Text } from "react-native";
import { ProtectedLayout } from "./protected-layout";
import { SessionProvider } from "./context";
import { SessionManager } from "./manager";
import { createApiClient } from "../api/client";
import { readPublicEnv } from "../config/env";
import { OAuthController } from "../links/oauth";
import { deferred, tokens, record } from "./test-fixtures";
import type { StoredSession } from "./types";
import { safeReturnPath, mailToken } from "../links/intent";
import { validatedLocale } from "./locale";
import ko from "../i18n/messages/ko.json";
import en from "../i18n/messages/en.json";
import i18n from "../i18n";
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

function context() {
  const read = deferred<StoredSession | null>();
  const manager = new SessionManager({
    store: { read: () => read.promise, write: async () => {}, clear: async () => {} },
    transport: { grant: async () => tokens("restored"), revoke: async () => {} },
  });
  const config = readPublicEnv({}, "ios", false);
  const oauth = new OAuthController({
    config,
    session: manager,
    pending: {
      read: async () => null,
      write: async () => {},
      clear: async () => {},
      take: async () => null,
    },
    crypto: { create: async () => ({ verifier: "v".repeat(64), challenge: "c".repeat(43) }) },
    browser: async () => ({ type: "cancel" }),
  });
  return {
    read,
    manager,
    value: { manager, config, oauth, api: createApiClient(config, manager) },
  };
}
test.each([true, false])(
  "a protected cold deep link waits for secure restoration (authenticated=%s)",
  async (authenticated) => {
    await i18n.changeLanguage("en");
    const scope = context();
    const result = await renderRouter(
      {
        _layout: () => (
          <SessionProvider value={scope.value}>
            <Stack />
          </SessionProvider>
        ),
        "(app)/_layout": ProtectedLayout,
        "(app)/me/sessions": () => <Text>Private sessions</Text>,
        login: () => <Text>Public login</Text>,
        index: () => <Text>Public home</Text>,
      },
      { initialUrl: "/me/sessions" },
    );
    expect(screen.queryByText("Private sessions")).toBeNull();
    expect(screen.queryByText("Public login")).toBeNull();
    let restoration: Promise<void>;
    await act(async () => {
      restoration = scope.manager.restore();
    });
    await act(async () => {
      scope.read.resolve(authenticated ? record("restored") : null);
      await restoration!;
    });
    expect(
      await screen.findByText(authenticated ? "Private sessions" : "Public login"),
    ).toBeTruthy();
    if (!authenticated) expect(result.getSearchParams()).toEqual({ returnTo: "/me/sessions" });
    if (authenticated) {
      await act(async () => {
        await scope.manager.signOut();
      });
      expect(await screen.findByText("Public login")).toBeTruthy();
      await act(async () => {
        router.push("/me/sessions");
      });
      expect(screen.queryByText("Private sessions")).toBeNull();
    }
  },
);
test("navigation, mail parameters and server locale reject untrusted values", () => {
  for (const value of ["https://evil.test", "//evil.test", "/me/sessions?token=secret", ["/me"]])
    expect(safeReturnPath(value)).toBe("/me/sessions");
  expect(safeReturnPath("/posts/new")).toBe("/posts/new");
  expect(mailToken({ token: ["one", "two"] })).toBeNull();
  expect(mailToken({ token: "safe", next: "evil" })).toBeNull();
  expect(mailToken({ token: "safe-token" })).toBe("safe-token");
  expect(validatedLocale("en")).toBe("en");
  expect(validatedLocale("javascript:bad")).toBeNull();
  expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
});
