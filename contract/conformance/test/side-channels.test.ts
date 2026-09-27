import { describe, expect, it } from "vitest";
import { createMailpitMailbox } from "../src/side-channels/mailpit.ts";
import { createRedirectOAuthDriver } from "../src/side-channels/oauth.ts";

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

describe("Mailpit 메일함", () => {
  it("받는 사람의 가장 최근 메일 본문을 읽는다", async () => {
    const calls: string[] = [];
    const fetchStub = (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);
      if (url.endsWith("/api/v1/messages")) {
        return Promise.resolve(
          json({
            messages: [
              { ID: "b", To: [{ Address: "other@example.com" }], Subject: "x" },
              { ID: "a", To: [{ Address: "user@example.com" }], Subject: "Verify" },
            ],
          }),
        );
      }
      return Promise.resolve(
        json({
          ID: "a",
          To: [{ Address: "user@example.com" }],
          Subject: "Verify",
          Text: "go ?token=abc",
        }),
      );
    };
    const mailbox = createMailpitMailbox("http://mail.test", { fetch: fetchStub });
    const mail = await mailbox.latest("user@example.com");
    expect(mail).toEqual({ to: "user@example.com", subject: "Verify", text: "go ?token=abc" });
    expect(calls).toEqual([
      "http://mail.test/api/v1/messages",
      "http://mail.test/api/v1/message/a",
    ]);
  });

  it("제한 시간 안에 메일이 오지 않으면 던진다", async () => {
    const fetchStub = () => Promise.resolve(json({ messages: [] }));
    const mailbox = createMailpitMailbox("http://mail.test", {
      fetch: fetchStub,
      pollMs: 5,
    });
    await expect(mailbox.latest("nobody@example.com", { timeoutMs: 20 })).rejects.toThrow(
      "nobody@example.com",
    );
  });
});

describe("리다이렉트 OAuth 드라이버", () => {
  it("프론트 콜백 주소에 닿을 때까지 리다이렉트를 따라가 code를 꺼낸다", async () => {
    const visited: string[] = [];
    const fetchStub = (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      visited.push(url);
      if (url.startsWith("http://api.test/api/v1/oauth/google/authorize")) {
        return Promise.resolve(redirect("http://idp.test/google/authorize?state=s"));
      }
      if (url.startsWith("http://idp.test/")) {
        return Promise.resolve(
          redirect("http://api.test/api/v1/oauth/google/callback?state=s&code=c"),
        );
      }
      return Promise.resolve(redirect("http://web.test/callback?code=one-time"));
    };
    const driver = createRedirectOAuthDriver({
      baseUrl: "http://api.test",
      fetch: fetchStub,
    });
    await expect(driver.authorize("google", "http://web.test/callback")).resolves.toEqual({
      code: "one-time",
    });
    expect(visited).toHaveLength(3);
  });

  it("콜백이 error를 붙여 돌아오면 그 코드로 던진다", async () => {
    const fetchStub = () =>
      Promise.resolve(redirect("http://web.test/callback?error=auth.oauth_denied"));
    const driver = createRedirectOAuthDriver({
      baseUrl: "http://api.test",
      fetch: fetchStub,
    });
    await expect(driver.authorize("kakao", "http://web.test/callback")).rejects.toThrow(
      "auth.oauth_denied",
    );
  });
});
