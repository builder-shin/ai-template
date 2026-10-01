import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import { base, mockClient, postForm, serverForm } from "./helpers";

describe("Task 8 가입·메일 인증·재발송의 JS 없는 실제 폼", () => {
  it.each(["/signup", "/en/signup"])(
    "%s 가입부터 메일·재발송·인증까지 JS 없이 처리한다",
    async (path) => {
      const email = `signup-http-${randomUUID()}@example.com`;
      const form = serverForm(
        await (await fetch(`${base}${path}`, { headers: { "Accept-Language": "ko" } })).text(),
        "signup",
      );
      form.body.set("name", "Signup HTTP user");
      form.body.set("email", email);
      form.body.set("password", "signup-http-password"); // betterleaks:allow 테스트 비밀번호
      const signed = await postForm(path, form);
      expect(signed.status).toBe(200);
      let html = await signed.text();
      expect(html).toContain(
        path.startsWith("/en")
          ? "Verification email sent. Check your inbox."
          : "인증 메일을 보냈습니다. 받은 편지함을 확인해 주세요.",
      );
      expect(html).not.toContain('name="password"');
      const resent = await postForm(path, serverForm(html, "resend"));
      expect(resent.status).toBe(200);
      html = await resent.text();
      expect(html).not.toContain('name="password"');
      const response = await fetch(
        `${inject("mockBaseUrl")}/_test/mail?to=${encodeURIComponent(email)}`,
      );
      const mail = (await response.json()) as { messages: { text: string; subject: string }[] };
      expect(mail.messages).toHaveLength(2);
      expect(mail.messages[0]!.subject).toBe(
        path.startsWith("/en") ? "Confirm your email address" : "이메일 주소를 확인해 주세요",
      );
      const link = new URL(mail.messages[1]!.text.match(/https?:\/\/\S+/)![0]);
      expect(link.pathname).toBe("/verify-email");
      const verifyPath = `${link.pathname}${link.search}`;
      // FRONTEND_URL의 origin만 자유 포트 Next로 바꾼다. 메일 경로·쿼리는 그대로다.
      const cookie = path.startsWith("/en") ? "NEXT_LOCALE=en" : "NEXT_LOCALE=ko";
      const page = await fetch(`${base}${verifyPath}`, {
        headers: { Cookie: cookie, "Accept-Language": "ko" },
        redirect: "manual",
      });
      const localePath = path.startsWith("/en") ? `/en${verifyPath}` : verifyPath;
      expect(page.status).toBe(path.startsWith("/en") ? 307 : 200);
      if (path.startsWith("/en"))
        expect(new URL(page.headers.get("location")!, base).pathname).toBe("/en/verify-email");
      const verificationPage = path.startsWith("/en") ? await fetch(`${base}${localePath}`) : page;
      const verified = await postForm(
        localePath,
        serverForm(await verificationPage.text(), "verify"),
      );
      expect(verified.status).toBe(200);
      expect(await verified.text()).toContain(
        path.startsWith("/en")
          ? "Your email is verified. You can log in now."
          : "이메일 인증을 마쳤습니다. 이제 로그인할 수 있습니다.",
      );
      const { data } = await mockClient().POST("/sessions", {
        body: {
          data: {
            type: "sessions",
            attributes: {
              grantType: "password",
              email,
              password: "signup-http-password", // betterleaks:allow 테스트 비밀번호
            },
          },
        },
      });
      const { data: me } = await mockClient(data!.data.attributes.accessToken).GET("/me");
      expect(me!.data.attributes.email).toBe(email);
    },
    30000,
  );

  it("JS 없는 가입 검증은 필드 오류를 연결하고 429 재발송은 Retry-After 초를 안내한다", async () => {
    const path = "/en/signup";
    const first = serverForm(await (await fetch(`${base}${path}`)).text(), "signup");
    first.body.set("name", "");
    first.body.set("email", "invalid");
    first.body.set("password", "x"); // betterleaks:allow 검증 실패용 비밀번호
    const failure = await postForm(path, first);
    expect(failure.status).toBe(200);
    const html = await failure.text();
    for (const name of ["name", "email", "password"])
      expect(html).toContain(`aria-describedby="${name}-errors"`);
    expect(html).not.toContain('value="x"');
    const form = serverForm(html, "signup");
    form.body.set("name", "Rate limit user");
    form.body.set("email", `signup-limit-${randomUUID()}@example.com`);
    form.body.set("password", "signup-http-password"); // betterleaks:allow 테스트 비밀번호
    let response = await postForm(path, form);
    for (let attempt = 0; attempt < 4; attempt++)
      response = await postForm(path, serverForm(await response.text(), "resend"));
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/Try again in \d+ seconds\./);
  });

  it("로케일 없는 메일 경로는 헤더와 쿠키로 언어를 고르고 GET에서 토큰을 소비하지 않는다", async () => {
    const path = "/verify-email?token=invalid";
    const first = await fetch(`${base}${path}`, {
      headers: { "Accept-Language": "en" },
      redirect: "manual",
    });
    expect(first.status).toBe(307);
    expect(new URL(first.headers.get("location")!, base).pathname).toBe("/en/verify-email");
    expect(new URL(first.headers.get("location")!, base).search).toBe("?token=invalid");
    const ko = await fetch(`${base}${path}`, {
      headers: { Cookie: "NEXT_LOCALE=ko", "Accept-Language": "en" },
    });
    expect(ko.status).toBe(200);
    expect(await ko.text()).toContain('<html lang="ko">');
    const form = serverForm(await (await fetch(`${base}/en${path}`)).text(), "verify");
    const failure = await postForm(`/en${path}`, form);
    expect(failure.status).toBe(200);
    expect(await failure.text()).toContain("The verification link is invalid or expired.");
    const missing = await fetch(`${base}/en/verify-email`);
    expect(missing.status).toBe(200);
    expect(await missing.text()).toContain("The verification link is invalid or expired.");
  });

  it.each([
    ["/verify-email", "인증 링크가 올바르지 않거나 만료되었습니다."],
    ["/en/verify-email", "The verification link is invalid or expired."],
  ])("%s의 중복 token 쿼리는 번역한 오류만 보여 주고 제출을 막는다", async (path, notice) => {
    const response = await fetch(`${base}${path}?token=a&token=b`, {
      headers: { "Accept-Language": "ko" },
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(`>${notice}</p>`);
    expect(html).not.toContain('type="submit"');
  });
});
