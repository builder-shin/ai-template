import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAIL_LINKS } from "../src/side-channels.ts";
import { createMailpitMailbox } from "../src/side-channels/mailpit.ts";
import { createMockOAuthDriver, mockClaims } from "../src/side-channels/oauth.ts";

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

describe("모의 OAuth 드라이버", () => {
  it("제공자의 로그인 폼에 신원을 보내고, 백엔드 콜백을 거쳐 프론트 콜백의 쿼리를 준다", async () => {
    const posted: string[] = [];
    let codeChallenge = "";
    const fetchStub = (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("http://api.test/api/v1/oauth/kakao/authorize")) {
        codeChallenge = new URL(url).searchParams.get("codeChallenge") ?? "";
        return Promise.resolve(redirect("http://idp.test/kakao/authorize?state=s&client_id=c"));
      }
      if (url.startsWith("http://idp.test/")) {
        posted.push(init?.body instanceof URLSearchParams ? init.body.toString() : "");
        return Promise.resolve(
          redirect("http://localhost:8000/api/v1/oauth/kakao/callback?state=s&code=c"),
        );
      }
      if (url.startsWith("http://api.test/api/v1/oauth/kakao/callback?state=s&code=c")) {
        return Promise.resolve(redirect("http://web.test/callback?code=one-time"));
      }
      return Promise.reject(new Error(`예상하지 못한 요청: ${url}`));
    };
    const driver = createMockOAuthDriver({ baseUrl: "http://api.test", fetch: fetchStub });
    const person = { subject: "42", email: "a@example.com", emailVerified: true, name: "Ada" };
    const back = await driver.signIn("kakao", "http://web.test/callback", person);
    expect(back.query.get("code")).toBe("one-time");
    expect(codeChallenge).toHaveLength(43);
    expect(back.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(createHash("sha256").update(back.codeVerifier).digest("base64url")).toBe(codeChallenge);
    const form = new URLSearchParams(posted[0]);
    expect(form.get("username")).toBe("42");
    expect(JSON.parse(form.get("claims") ?? "")).toEqual(mockClaims("kakao", person));
  });

  it("제공자가 백엔드의 콜백 경로가 아닌 곳으로 보내면 던진다", async () => {
    const fetchStub = (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("http://api.test/api/v1/oauth/kakao/authorize")) {
        return Promise.resolve(redirect("http://idp.test/kakao/authorize?state=s"));
      }
      if (url.startsWith("http://idp.test/")) {
        return Promise.resolve(
          redirect("http://localhost:8000/oauth/kakao/callback?state=s&code=c"),
        );
      }
      // 백엔드 콜백은 정상으로 답한다. 드라이버가 경로를 보지 않으면 signIn이 성공한다.
      if (url.startsWith("http://api.test/api/v1/oauth/kakao/callback")) {
        return Promise.resolve(redirect("http://web.test/callback?code=one-time"));
      }
      return Promise.reject(new Error(`예상하지 못한 요청: ${url}`));
    };
    const driver = createMockOAuthDriver({ baseUrl: "http://api.test", fetch: fetchStub });
    await expect(
      driver.signIn("kakao", "http://web.test/callback", { subject: "42" }),
    ).rejects.toThrow("콜백 경로는 /api/v1/oauth/kakao/callback여야 한다");
  });

  it("codeVerifier를 주면 만든 verifier 대신 그 값의 S256을 codeChallenge로 보낸다", async () => {
    let codeChallenge = "";
    const fetchStub = (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      codeChallenge = new URL(url).searchParams.get("codeChallenge") ?? "";
      return Promise.resolve(redirect("http://idp.test/kakao/authorize?state=s"));
    };
    const driver = createMockOAuthDriver({ baseUrl: "http://api.test", fetch: fetchStub });
    const started = await driver.start("kakao", "http://web.test/callback", { codeVerifier: "" });
    expect(started.codeVerifier).toBe("");
    expect(codeChallenge).toBe(createHash("sha256").update("").digest("base64url"));
  });

  it("제공자마다 프로필 응답의 모양을 흉내 낸다", () => {
    const person = { subject: "7", email: "b@example.com", name: "Bo" };
    expect(mockClaims("naver", person)).toEqual({
      response: { id: "7", email: "b@example.com", name: "Bo" },
    });
    expect(mockClaims("google", { ...person, emailVerified: true })).toEqual({
      email: "b@example.com",
      email_verified: true,
      name: "Bo",
      hd: "example.com",
    });
    expect(
      mockClaims("google", { ...person, emailVerified: true, googleWorkspace: false }),
    ).toEqual({
      email: "b@example.com",
      email_verified: true,
      name: "Bo",
    });
  });

  it("백엔드가 302가 아니면 던진다", async () => {
    const failure = {
      errors: [{ status: "500", code: "internal.unexpected", title: "Internal Server Error" }],
      meta: { traceId: "0".repeat(32) },
    };
    const fetchStub = () =>
      Promise.resolve(
        new Response(JSON.stringify(failure), {
          status: 500,
          headers: { "content-type": "application/vnd.api+json" },
        }),
      );
    const driver = createMockOAuthDriver({ baseUrl: "http://api.test", fetch: fetchStub });
    await expect(driver.start("google", "http://web.test/callback")).rejects.toThrow("302");
  });

  it("리다이렉트 본문이 JSON이 아니어도(NestJS의 기본 안내 문구 등) 그대로 따라간다", async () => {
    const fetchStub = () =>
      Promise.resolve(
        new Response("Found. Redirecting to http://idp.test/kakao/authorize?state=s", {
          status: 302,
          headers: {
            location: "http://idp.test/kakao/authorize?state=s",
            "content-type": "text/plain; charset=utf-8",
          },
        }),
      );
    const driver = createMockOAuthDriver({ baseUrl: "http://api.test", fetch: fetchStub });
    await expect(driver.start("kakao", "http://web.test/callback")).resolves.toMatchObject({
      providerUrl: "http://idp.test/kakao/authorize?state=s",
      state: "s",
    });
  });
});
