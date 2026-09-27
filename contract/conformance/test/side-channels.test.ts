import { describe, expect, it } from "vitest";
import { MAIL_LINKS } from "../src/side-channels.ts";
import { createMailpitMailbox } from "../src/side-channels/mailpit.ts";
import { createRedirectOAuthDriver } from "../src/side-channels/oauth.ts";

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

const SEARCH = `http://mail.test/api/v1/search?query=${encodeURIComponent('to:"user@example.com"')}`;

interface StoredMail {
  readonly ID: string;
  readonly Created: string;
  readonly Subject: string;
  readonly Text: string;
}

/** Mailpit API 흉내. 검색은 최신순(앞이 최신)으로 돌려준다. */
function mailpitStub(stored: readonly StoredMail[], calls: string[] = []) {
  return (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url.startsWith("http://mail.test/api/v1/search")) {
      return Promise.resolve(
        json({ messages: stored.map(({ ID, Created }) => ({ ID, Created })) }),
      );
    }
    const found = stored.find((mail) => url.endsWith(`/api/v1/message/${mail.ID}`));
    return Promise.resolve(json(found));
  };
}

const VERIFY: StoredMail = {
  ID: "a",
  Created: "2026-09-27T05:00:00.000Z",
  Subject: "Verify",
  Text: "go /verify-email?token=abc",
};
const WELCOME: StoredMail = {
  ID: "b",
  Created: "2026-09-27T05:00:01.000Z",
  Subject: "Welcome",
  Text: "hello",
};

describe("Mailpit 메일함", () => {
  it("받는 사람으로 검색해 가장 최근 메일을 읽는다", async () => {
    const calls: string[] = [];
    const mailbox = createMailpitMailbox("http://mail.test", {
      fetch: mailpitStub([WELCOME, VERIFY], calls),
    });
    expect(await mailbox.latest("user@example.com")).toEqual({
      id: "b",
      to: "user@example.com",
      subject: "Welcome",
      text: "hello",
      receivedAt: "2026-09-27T05:00:01.000Z",
    });
    expect(calls).toEqual([SEARCH, "http://mail.test/api/v1/message/b"]);
  });

  it("linkPath가 있으면 그 경로의 토큰 링크가 든 메일만 본다", async () => {
    const mailbox = createMailpitMailbox("http://mail.test", {
      fetch: mailpitStub([WELCOME, VERIFY]),
    });
    const mail = await mailbox.latest("user@example.com", {
      linkPath: MAIL_LINKS.emailVerification,
    });
    expect(mail.id).toBe("a");
  });

  it("after가 있으면 그 메일보다 뒤에 받은 메일만 본다", async () => {
    const first = await createMailpitMailbox("http://mail.test", {
      fetch: mailpitStub([VERIFY]),
    }).latest("user@example.com");
    const again = {
      ...VERIFY,
      ID: "c",
      Created: "2026-09-27T05:00:02.000Z",
      Text: "go /verify-email?token=def",
    };
    const mailbox = createMailpitMailbox("http://mail.test", {
      fetch: mailpitStub([again, WELCOME, VERIFY]),
    });
    const mail = await mailbox.latest("user@example.com", {
      after: first,
      linkPath: MAIL_LINKS.emailVerification,
    });
    expect(mail.id).toBe("c");
    const stale = createMailpitMailbox("http://mail.test", {
      fetch: mailpitStub([VERIFY]),
      pollMs: 5,
    });
    await expect(stale.latest("user@example.com", { after: first, timeoutMs: 20 })).rejects.toThrow(
      "user@example.com",
    );
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
