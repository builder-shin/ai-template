import type * as SettingsModule from "../../config/settings.js";
import { expect, it, vi } from "vitest";
vi.mock("../../config/settings.js", async (original) => {
  const actual = await original<typeof SettingsModule>();
  return { ...actual, loadSettings: () => ({ OTEL_ENABLED: false }) };
});
import { ignoreIncoming } from "../register.js";
it.each(["/health/live", "/health/ready", "/health/ready?private=query", "/health/other"])(
  "헬스 경로는 HTTP 계측에서 무시한다: %s",
  (url) => {
    expect(ignoreIncoming({ url })).toBe(true);
  },
);
it.each(["/api/v1/posts", "/health", "/health-other/live", undefined])(
  "헬스 경로 밖의 요청은 계측한다: %s",
  (url) => {
    expect(ignoreIncoming(url === undefined ? {} : { url })).toBe(false);
  },
);
