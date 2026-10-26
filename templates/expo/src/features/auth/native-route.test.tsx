import { Stack } from "expo-router";
import { cleanup, renderRouter, screen } from "expo-router/testing-library";
import VerifyEmail from "../../app/verify-email";
import * as nativeIntent from "../../app/+native-intent";
import { createHttpScope } from "../../lib/testing/native-http";
import i18n from "../../lib/i18n";
import { getMockContext } from "expo-router/build/testing-library/mock-config";
import { getExactRoutes } from "expo-router/build/getRoutes";
import { getLinkingConfig } from "expo-router/build/getLinkingConfig";

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("../../lib/config/runtime", () => ({
  runtimeConfig: () => jest.requireActual("../../lib/config/env").readPublicEnv({}, "ios", false),
}));

test("the actual Router and public mail screen handle the cold SDK launch command", async () => {
  await i18n.changeLanguage("en");
  const scope = createHttpScope("http://127.0.0.1:4112");
  const { scheme } = scope.value.config;
  const context = {
    _layout: () => (
      <scope.Wrapper>
        <Stack screenOptions={{ headerShown: false }} />
      </scope.Wrapper>
    ),
    "+native-intent": nativeIntent,
    "verify-email": VerifyEmail,
  };
  const incoming = `${scheme}://expo-development-client/?${new URLSearchParams({
    url: "http://127.0.0.1:8082",
    aitpl_link: `${scheme}://verify-email?token=safe-token`,
  })}`;
  const linkingModule = jest.requireMock<typeof import("expo-linking")>("expo-linking");
  jest.spyOn(linkingModule, "getLinkingURL").mockReturnValue(incoming);
  const redirect = jest.spyOn(nativeIntent, "redirectSystemPath");
  try {
    const sdkContext = getMockContext(context);
    const linking = getLinkingConfig(getExactRoutes(sdkContext)!, sdkContext, {
      metaOnly: true,
      redirects: [],
      skipGenerated: false,
      sitemap: false,
      notFound: false,
    });
    const path = await linking.getInitialURL?.();
    expect(redirect).toHaveBeenCalledWith({ path: incoming, initial: true });
    expect(path).toBe("/verify-email?token=safe-token");
    const result = await renderRouter(context, { initialUrl: path! });
    expect(await screen.findByRole("button", { name: "Verify email" })).toBeEnabled();
    expect(result.getPathname()).toBe("/verify-email");
    expect(result.getSearchParams()).toEqual({ token: "safe-token" });
  } finally {
    await cleanup();
    await scope.dispose();
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
});
