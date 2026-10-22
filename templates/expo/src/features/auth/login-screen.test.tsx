import { renderRouter, screen, act } from "expo-router/testing-library";
import { Stack, router } from "expo-router";
import { Text } from "react-native";
import { LoginScreen } from "./login-screen";
import { SessionManager, SessionProvider } from "../../lib/session";
import { memoryStore, record, tokens, deferred } from "../../lib/session/test-fixtures";
import type { StoredSession } from "../../lib/session/types";
import { createApiClient } from "../../lib/api/client";
import { readPublicEnv } from "../../lib/config/env";
import { createNativeOAuth } from "../../lib/links";
import i18n from "../../lib/i18n";
test("a restored session leaves the cold-launch login destination without asking for credentials again", async () => {
  await i18n.changeLanguage("en");
  const manager = new SessionManager({
    store: memoryStore(record("restored")),
    transport: { grant: async () => tokens("restored"), revoke: async () => {} },
  });
  await manager.restore();
  const config = readPublicEnv({}, "ios", false),
    value = {
      manager,
      config,
      api: createApiClient(config, manager),
      oauth: createNativeOAuth(config, manager),
    };
  const rendered = await renderRouter(
    {
      _layout: () => (
        <SessionProvider value={value}>
          <Stack />
        </SessionProvider>
      ),
      login: LoginScreen,
      "me/sessions": () => <Text>Restored session destination</Text>,
      index: () => <Text>Public home</Text>,
    },
    { initialUrl: "/login" },
  );
  try {
    expect(await screen.findByText("Restored session destination")).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
  } finally {
    await rendered.unmount();
    await manager.signOut();
  }
});
test("a login screen behind a cold deep link cannot replace that destination after restoration", async () => {
  await i18n.changeLanguage("en");
  const read = deferred<StoredSession | null>();
  const manager = new SessionManager({
    store: { read: () => read.promise, write: async () => {}, clear: async () => {} },
    transport: { grant: async () => tokens("restored"), revoke: async () => {} },
  });
  const restoring = manager.restore();
  const config = readPublicEnv({}, "ios", false);
  const value = {
    manager,
    config,
    api: createApiClient(config, manager),
    oauth: createNativeOAuth(config, manager),
  };
  const rendered = await renderRouter(
    {
      _layout: () => (
        <SessionProvider value={value}>
          <Stack />
        </SessionProvider>
      ),
      login: LoginScreen,
      me: () => <Text>Intended private profile</Text>,
      "me/sessions": () => <Text>Unrequested sessions</Text>,
      index: () => <Text>Public home</Text>,
    },
    { initialUrl: "/login" },
  );
  try {
    expect(screen.queryByLabelText("Password")).toBeNull();
    await act(async () => {
      router.push("/me");
    });
    expect(await screen.findByText("Intended private profile")).toBeTruthy();
    await act(async () => {
      read.resolve(record("restored"));
      await restoring;
    });
    expect(await screen.findByText("Intended private profile")).toBeTruthy();
    expect(screen.queryByText("Unrequested sessions")).toBeNull();
  } finally {
    await rendered.unmount();
    await manager.signOut();
  }
});
