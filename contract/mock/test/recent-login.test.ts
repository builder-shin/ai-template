/** 탈퇴 재인증을 짧은 창으로 검증한다. 기본 API 규칙은 FastAPI와 같은 600초다. */
import { expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { SECOND } from "../src/core/clock.ts";
import { newUser, send, signIn } from "./accounts.ts";
import { codesOf, testApp, testClock } from "./support.ts";

it("최근 로그인 설정은 기본 600초이며 빈 값도 기본값이다", () => {
  for (const env of [{}, { RECENT_LOGIN_SECONDS: "" }, { RECENT_LOGIN_SECONDS: "  " }])
    expect(loadConfig(env).recentLoginSeconds).toBe(600);
  expect(loadConfig({ RECENT_LOGIN_SECONDS: " 2 " }).recentLoginSeconds).toBe(2);
});
it.each(["0", "-1", "1.5", "no", "9007199254740992"])(
  "최근 로그인 설정 %s는 시작할 때 거절한다",
  (value) => {
    expect(() => loadConfig({ RECENT_LOGIN_SECONDS: value })).toThrow("RECENT_LOGIN_SECONDS");
  },
);
it("짧은 창이 지난 세션은 refresh로 풀리지 않고 새 로그인으로만 탈퇴한다", async () => {
  const clock = testClock();
  const { app, state } = testApp({ recentLoginSeconds: 2 }, { clock });
  const user = await newUser(app, state);
  clock.advance(3 * SECOND);
  const refused = await send(app, "DELETE", "/api/v1/me", { token: user.accessToken });
  expect(await codesOf(refused, 401)).toEqual(["auth.reauthentication_required"]);
  expect(refused.headers.get("www-authenticate")).toBe(
    'Bearer error="insufficient_user_authentication", max_age=2',
  );
  const refresh = await send(app, "POST", "/api/v1/sessions", {
    document: {
      data: {
        type: "sessions",
        attributes: { grantType: "refreshToken", refreshToken: user.refreshToken },
      },
    },
  });
  expect(refresh.status).toBe(201);
  const { data } = (await refresh.json()) as { data: { attributes: { accessToken: string } } };
  expect(
    await codesOf(
      await send(app, "DELETE", "/api/v1/me", { token: data.attributes.accessToken }),
      401,
    ),
  ).toEqual(["auth.reauthentication_required"]);
  const fresh = await signIn(app, user.email);
  expect((await send(app, "DELETE", "/api/v1/me", { token: fresh.accessToken })).status).toBe(204);
});
