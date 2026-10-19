import { afterEach, expect, it, vi } from "vitest";
import { fixture, principal, required } from "./fixtures.js";
const fixtures: ReturnType<typeof fixture>[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
  vi.useRealTimers();
});
it("먼 미래 시각에도 재인증 challenge를 돌려준다", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
  const f = fixture();
  fixtures.push(f);
  await expect(f.service.delete(principal)).rejects.toMatchObject({
    init: {
      status: 401,
      code: "auth.reauthentication_required",
      headers: {
        "WWW-Authenticate": 'Bearer error="insufficient_user_authentication", max_age=600',
      },
    },
  });
});
it.each([600, 2])("재인증 오류는 설정한 %s초 step-up challenge를 돌려준다", async (seconds) => {
  const f = fixture();
  fixtures.push(f);
  f.settings.RECENT_LOGIN_SECONDS = seconds;
  required(f.state.sessions[0]).authenticatedAt = new Date(Date.now() - (seconds + 1) * 1000);
  await expect(f.service.delete(principal)).rejects.toMatchObject({
    init: {
      status: 401,
      code: "auth.reauthentication_required",
      headers: {
        "WWW-Authenticate": `Bearer error="insufficient_user_authentication", max_age=${String(seconds)}`,
      },
    },
  });
  expect(f.state.users[0]?.status).toBe("active");
  expect(f.events).toEqual([]);
});
