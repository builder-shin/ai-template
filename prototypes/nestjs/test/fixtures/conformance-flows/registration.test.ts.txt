import { describe, expect, it } from "vitest";
import { extractToken, MAIL_LINKS } from "../../src/side-channels.ts";
import {
  api,
  codes,
  mailbox,
  PASSWORD,
  problems,
  register,
  signIn,
  target,
  uniqueEmail,
  verify,
} from "./support.ts";

function verifyWith(token: string) {
  return api().POST("/api/v1/email-verifications", {
    body: { data: { type: "email-verifications", attributes: { token } } },
  });
}

describe(`가입과 이메일 인증 (${target.name})`, () => {
  it("가입하면 인증 메일이 오고, 인증을 마쳐야 로그인할 수 있다", async () => {
    const email = uniqueEmail();
    const { data, response } = await api().POST("/api/v1/registrations", {
      body: {
        data: { type: "registrations", attributes: { email, password: PASSWORD, name: "가입자" } },
      },
    });
    expect(response.status).toBe(201);
    expect(data?.data.attributes.email).toBe(email);
    const userId = data?.data.relationships.user.data?.id ?? "";
    const account = { email, password: PASSWORD, userId };

    const early = await api().POST("/api/v1/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: { grantType: "password", email, password: PASSWORD },
        },
      },
    });
    expect(early.response.status).toBe(403);
    expect(codes(early.error)).toEqual(["auth.email_not_verified"]);

    await verify(account);
    expect((await signIn(account)).userId).toBe(userId);
  });

  it("이미 쓰는 이메일로는 가입하지 못한다", async () => {
    const { email } = await register();
    const { error, response } = await api().POST("/api/v1/registrations", {
      body: {
        data: { type: "registrations", attributes: { email, password: PASSWORD, name: "둘째" } },
      },
    });
    expect(response.status).toBe(422);
    expect(problems(error)).toEqual([["validation.already_taken", "/data/attributes/email"]]);
  });

  it("인증 메일을 다시 받으면 새 토큰으로 인증하고, 같이 발급된 토큰은 더 쓰지 못한다", async () => {
    const account = await register();
    const linkPath = MAIL_LINKS.emailVerification;
    const first = await mailbox.latest(account.email, { linkPath });
    const resend = await api().POST("/api/v1/email-verification-requests", {
      body: { data: { type: "email-verification-requests", attributes: { email: account.email } } },
    });
    expect(resend.response.status).toBe(202);
    const second = await mailbox.latest(account.email, { after: first, linkPath });
    expect(extractToken(second)).not.toBe(extractToken(first));

    const verified = await verifyWith(extractToken(second));
    expect(verified.response.status).toBe(201);
    const stale = await verifyWith(extractToken(first));
    expect(stale.response.status).toBe(422);
    expect(problems(stale.error)).toEqual([
      ["auth.verification_token_invalid", "/data/attributes/token"],
    ]);
  });

  it("없는 계정으로 재발송을 요청해도 202다(계정이 있는지 드러내지 않는다)", async () => {
    const { response } = await api().POST("/api/v1/email-verification-requests", {
      body: {
        data: { type: "email-verification-requests", attributes: { email: uniqueEmail("nobody") } },
      },
    });
    expect(response.status).toBe(202);
  });

  it("틀린 토큰으로는 인증하지 못한다", async () => {
    const { error, response } = await verifyWith("not-a-token");
    expect(response.status).toBe(422);
    expect(codes(error)).toEqual(["auth.verification_token_invalid"]);
  });
});
