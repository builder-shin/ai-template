import { describe, expect, it } from "vitest";
import { extractToken, MAIL_LINKS } from "../../src/side-channels.ts";
import {
  api,
  codes,
  LONE_SURROGATE,
  mailbox,
  NEW_PASSWORD,
  newUser,
  problems,
  signIn,
  target,
  uniqueEmail,
} from "./support.ts";

function requestReset(email: string) {
  return api().POST("/api/v1/password-reset-requests", {
    body: { data: { type: "password-reset-requests", attributes: { email } } },
  });
}

function reset(token: string, password: string) {
  return api().POST("/api/v1/password-resets", {
    body: { data: { type: "password-resets", attributes: { token, password } } },
  });
}

function passwordGrant(email: string, password: string) {
  return api().POST("/api/v1/sessions", {
    body: { data: { type: "sessions", attributes: { grantType: "password", email, password } } },
  });
}

describe(`비밀번호 (${target.name})`, () => {
  it("재설정 메일의 토큰으로 비밀번호를 바꾸면 모든 세션이 끝나고, 토큰은 한 번만 쓴다", async () => {
    const user = await newUser();
    expect((await requestReset(user.email)).response.status).toBe(202);
    const mail = await mailbox.latest(user.email, { linkPath: MAIL_LINKS.passwordReset });
    const token = extractToken(mail);

    expect((await reset(token, NEW_PASSWORD)).response.status).toBe(201);
    expect((await api(user.accessToken).GET("/api/v1/me")).response.status).toBe(401);
    const old = await passwordGrant(user.email, user.password);
    expect(codes(old.error)).toEqual(["auth.invalid_credentials"]);
    await signIn({ email: user.email, password: NEW_PASSWORD });

    const again = await reset(token, NEW_PASSWORD);
    expect(again.response.status).toBe(422);
    expect(problems(again.error)).toEqual([
      ["auth.verification_token_invalid", "/data/attributes/token"],
    ]);
  });

  it("없는 계정으로 재설정을 요청해도 202다(계정이 있는지 드러내지 않는다)", async () => {
    expect((await requestReset(uniqueEmail("nobody"))).response.status).toBe(202);
  });

  it("비밀번호를 바꾸면 현재 세션은 남고 다른 세션은 끝난다", async () => {
    const user = await newUser();
    const other = await signIn(user);
    const changed = await user.api.POST("/api/v1/password-changes", {
      body: {
        data: {
          type: "password-changes",
          attributes: { currentPassword: user.password, newPassword: NEW_PASSWORD },
        },
      },
    });
    expect(changed.response.status).toBe(201);
    expect((await user.api.GET("/api/v1/me")).response.status).toBe(200);
    expect((await other.api.GET("/api/v1/me")).response.status).toBe(401);
    await signIn({ email: user.email, password: NEW_PASSWORD });
  });

  it("현재 비밀번호가 틀리거나 새 비밀번호가 짧으면 바꾸지 않는다", async () => {
    const user = await newUser();
    const change = (currentPassword: string, newPassword: string) =>
      user.api.POST("/api/v1/password-changes", {
        body: { data: { type: "password-changes", attributes: { currentPassword, newPassword } } },
      });
    const wrongPassword = "wrong-password"; // betterleaks:allow 틀린 비밀번호
    const wrong = await change(wrongPassword, NEW_PASSWORD);
    expect(wrong.response.status).toBe(401);
    expect(problems(wrong.error)).toEqual([
      ["auth.invalid_credentials", "/data/attributes/currentPassword"],
    ]);
    const short = await change(user.password, "x".repeat(7));
    expect(short.response.status).toBe(422);
    expect(problems(short.error)).toEqual([
      ["validation.too_short", "/data/attributes/newPassword"],
    ]);
    await signIn(user);
  });

  it("현재 비밀번호에 짝 없는 서로게이트가 있어도 틀린 비밀번호와 같은 401이다", async () => {
    const user = await newUser();
    const { error, response } = await user.api.POST("/api/v1/password-changes", {
      body: {
        data: {
          type: "password-changes",
          attributes: { currentPassword: LONE_SURROGATE, newPassword: NEW_PASSWORD },
        },
      },
    });
    expect(response.status).toBe(401);
    expect(problems(error)).toEqual([
      ["auth.invalid_credentials", "/data/attributes/currentPassword"],
    ]);
    await signIn(user);
  });
});
