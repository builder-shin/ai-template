import { renderRouter, screen } from "expo-router/testing-library";
import { Stack } from "expo-router";
import { Text } from "react-native";
import { LoginScreen } from "./login-screen";
import { SessionManager, SessionProvider } from "../../lib/session";
import { memoryStore, record, tokens } from "../../lib/session/test-fixtures";
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
