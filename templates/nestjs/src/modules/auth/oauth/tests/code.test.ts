import { expect, it } from "vitest";
import { sessionFixture } from "../../tests/session-fixtures.js";
import { oauthFixture, start, VERIFIER } from "./fixtures.js";
async function codeFixture() {
  const oauth = oauthFixture();
  const state = await start(oauth);
  const url = new URL(await oauth.service.callback("google", { state, code: "provider-code" }));
  const code = url.searchParams.get("code");
  const user = oauth.data.users[0];
  if (!code || !user) throw new Error("소셜 로그인 코드가 없다");
  const sessions = sessionFixture(oauth.store);
  sessions.addUser({ ...user });
  return { oauth, sessions, code, client: { ip: "192.0.2.4", userAgent: "OAuth fixture" } };
}
it("일회용 코드는 같은 verifier일 때 한 번만 세션과 토큰을 만든다", async () => {
  const f = await codeFixture();
  const result = await f.sessions.service.createWithOAuthCode(
    { code: f.code, codeVerifier: VERIFIER },
    f.client,
  );
  expect(result.data.type).toBe("sessions");
  expect(result.data.attributes.accessToken).toEqual(expect.any(String));
  expect(result.data.attributes.refreshToken).toEqual(expect.any(String));
  expect(f.sessions.state.sessions).toHaveLength(1);
  expect(f.sessions.state.audits[0]).toMatchObject({
    action: "session.login_succeeded",
    meta: { method: "oauth", provider: "google" },
  });
  await expect(
    f.sessions.service.createWithOAuthCode({ code: f.code, codeVerifier: VERIFIER }, f.client),
  ).rejects.toMatchObject({
    init: {
      status: 401,
      code: "auth.oauth_code_invalid",
      headers: { "WWW-Authenticate": "Bearer" },
    },
  });
  expect(f.sessions.state.sessions).toHaveLength(1);
});
it("이메일이 없는 소셜 계정도 일회용 코드로 세션을 만든다", async () => {
  const f = await codeFixture();
  const user = f.sessions.state.users[0];
  if (!user) throw new Error("사용자가 없다");
  user.email = null;
  user.emailVerifiedAt = null;
  const result = await f.sessions.service.createWithOAuthCode(
    { code: f.code, codeVerifier: VERIFIER },
    f.client,
  );
  expect(result.data.type).toBe("sessions");
  expect(f.sessions.state.sessions).toHaveLength(1);
});
it.each(["짧은 verifier", "다른 verifier", "만료", "없는 코드"])(
  "코드 교환 조건 %s에서 401이며 세션을 만들지 않는다",
  async (kind) => {
    const f = await codeFixture();
    if (kind === "만료") f.oauth.memory.advance(60);
    const input = {
      code: kind === "없는 코드" ? "unknown" : f.code,
      codeVerifier:
        kind === "짧은 verifier" ? "short" : kind === "다른 verifier" ? "a".repeat(43) : VERIFIER,
    };
    await expect(f.sessions.service.createWithOAuthCode(input, f.client)).rejects.toMatchObject({
      init: {
        status: 401,
        code: "auth.oauth_code_invalid",
        headers: { "WWW-Authenticate": "Bearer" },
      },
    });
    expect(f.sessions.state.sessions).toEqual([]);
    if (kind !== "없는 코드")
      await expect(
        f.sessions.service.createWithOAuthCode({ code: f.code, codeVerifier: VERIFIER }, f.client),
      ).rejects.toMatchObject({ init: { code: "auth.oauth_code_invalid" } });
  },
);
it("콜백 이후 비활성화된 계정은 코드 교환 시 403이다", async () => {
  const f = await codeFixture();
  const user = f.sessions.state.users[0];
  if (!user) throw new Error("사용자가 없다");
  user.status = "deactivated";
  await expect(
    f.sessions.service.createWithOAuthCode({ code: f.code, codeVerifier: VERIFIER }, f.client),
  ).rejects.toMatchObject({ init: { status: 403, code: "auth.account_deactivated" } });
  expect(f.sessions.state.sessions).toEqual([]);
});
it("콜백 이후 삭제된 계정의 코드는 401이다", async () => {
  const f = await codeFixture();
  f.sessions.state.users.splice(0);
  await expect(
    f.sessions.service.createWithOAuthCode({ code: f.code, codeVerifier: VERIFIER }, f.client),
  ).rejects.toMatchObject({ init: { status: 401, code: "auth.oauth_code_invalid" } });
});
