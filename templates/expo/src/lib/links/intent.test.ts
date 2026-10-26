import { routeIncomingPath } from "./intent";
import { readPublicEnv } from "../config/env";
const env = readPublicEnv({}, "ios", false);
describe("native intent routing", () => {
  test("normalizes only validated callback/mail links", () => {
    expect(routeIncomingPath(`${env.scheme}://oauth/callback?code=safe-code`, env)).toBe(
      "/oauth/callback?code=safe-code",
    );
    expect(routeIncomingPath("/verify-email?token=safe-token", env)).toBe(
      "/verify-email?token=safe-token",
    );
    expect(routeIncomingPath("http://localhost:3000/en/reset-password?token=safe-token", env)).toBe(
      "/reset-password?token=safe-token",
    );
  });
  test("allows product paths while permissions remain a Router/API responsibility", () => {
    expect(routeIncomingPath("/me/sessions", env)).toBe("/me/sessions");
    expect(routeIncomingPath(`${env.scheme}://posts/new`, env)).toBe("/posts/new");
    expect(routeIncomingPath("/", env)).toBe("/");
  });
  test.each([
    "https://evil.example/me",
    "//evil.example/me",
    "/me?role=admin",
    "/oauth/%63allback?code=x",
    "/posts/../me",
    "invalid intent",
  ])("rejects confused intent %s", (path) => expect(routeIncomingPath(path, env)).toBe("/login"));
});
