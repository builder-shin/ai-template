import { appSessionCookieName } from "../../src/lib/app-config.mjs";
import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import { EXAMPLE_SESSION_SECRET } from "../../src/lib/env";
import { sealSession } from "../../src/lib/session/cookie";
import { base, mockClient, postForm, responseSession, serverForm } from "./helpers";

describe("Task 9 비밀번호 재설정의 JS 없는 실제 폼", () => {
  it.each(["", "/en"])(
    "%s 요청·메일·재설정·새 비밀번호 로그인과 동일 응답을 확인한다",
    async (prefix) => {
      const email = `reset-http-${randomUUID()}@example.com`;
      const signupPath = `${prefix}/signup`;
      const signup = serverForm(await (await fetch(`${base}${signupPath}`)).text(), "signup");
      signup.body.set("name", "Reset HTTP user");
      signup.body.set("email", email);
      signup.body.set("password", "reset-http-old-password"); // betterleaks:allow 테스트 비밀번호
      expect((await postForm(signupPath, signup)).status).toBe(200);
      const requestPath = `${prefix}/forgot-password`;
      const requestHtml = await (
        await fetch(`${base}${requestPath}`, { headers: { "Accept-Language": "ko" } })
      ).text();
      const statuses = [];
      for (const address of [email, `missing-${randomUUID()}@example.com`]) {
        const request = serverForm(requestHtml, "request-reset");
        request.body.set("email", address);
        const response = await postForm(requestPath, request);
        expect(response.status).toBe(200);
        statuses.push((await response.text()).match(/<p role="status"[^>]*>([^<]+)<\/p>/)?.[1]);
      }
      expect(statuses[0]).toBe(
        prefix
          ? "If an account exists for that email, we sent a password reset link. Check your inbox."
          : "입력한 이메일의 계정이 있다면 비밀번호 재설정 메일을 보냈습니다. 받은 편지함을 확인해 주세요.",
      );
      expect(statuses[1]).toBe(statuses[0]);
      const mail = (await (
        await fetch(`${inject("mockBaseUrl")}/_test/mail?to=${encodeURIComponent(email)}`)
      ).json()) as { messages: { text: string }[] };
      const link = new URL(
        mail.messages
          .find((message) => message.text.includes("/reset-password?token="))!
          .text.match(/https?:\/\/\S+/)![0],
      );
      expect(link.pathname).toBe("/reset-password");
      const verification = new URL(
        mail.messages
          .find((message) => message.text.includes("/verify-email?token="))!
          .text.match(/https?:\/\/\S+/)![0],
      );
      await mockClient().POST("/email-verifications", {
        body: {
          data: {
            type: "email-verifications",
            attributes: { token: verification.searchParams.get("token")! },
          },
        },
      });
      const { data: old } = await mockClient().POST("/sessions", {
        body: {
          data: {
            type: "sessions",
            attributes: {
              grantType: "password",
              email,
              password: "reset-http-old-password", // betterleaks:allow 테스트 비밀번호
            },
          },
        },
      });
      const oldCookie = await sealSession(old!.data.attributes, EXAMPLE_SESSION_SECRET);
      const rawPath = `${link.pathname}${link.search}`;
      const page = await fetch(`${base}${rawPath}`, {
        headers: { Cookie: `NEXT_LOCALE=${prefix ? "en" : "ko"}`, "Accept-Language": "ko" },
        redirect: "manual",
      });
      expect(page.status).toBe(prefix ? 307 : 200);
      if (prefix) expect(new URL(page.headers.get("location")!, base).search).toBe(link.search);
      const path = `${prefix}${rawPath}`;
      const html = await (prefix ? await fetch(`${base}${path}`) : page).text();
      const form = serverForm(html, "reset");
      form.body.set("password", "reset-http-new-password"); // betterleaks:allow 테스트 비밀번호
      const reset = await postForm(path, form, oldCookie);
      expect(reset.status).toBe(200);
      expect(reset.headers.get("set-cookie")).toContain(`${appSessionCookieName("development")}=;`);
      expect(reset.headers.get("set-cookie")).toContain("Max-Age=0");
      await expect(mockClient(old!.data.attributes.accessToken).GET("/me")).rejects.toMatchObject({
        status: 401,
      });
      const success = await reset.text();
      expect(success).toContain(
        prefix
          ? "Your password has been reset. Log in with your new password."
          : "비밀번호를 재설정했습니다. 새 비밀번호로 로그인해 주세요.",
      );
      expect(success).toContain(`href="${prefix}/login"`);
      expect(success).not.toContain('name="password"');
      const loginPath = `${prefix}/login`;
      const loginForm = serverForm(await (await fetch(`${base}${loginPath}`)).text(), "login");
      loginForm.body.set("email", email);
      loginForm.body.set("password", "reset-http-new-password"); // betterleaks:allow 테스트 비밀번호
      const loggedIn = await postForm(loginPath, loginForm);
      expect(loggedIn.status).toBe(303);
      expect(new URL(loggedIn.headers.get("location")!, base).pathname).toBe(prefix || "/");
      const session = await responseSession(loggedIn);
      expect((await mockClient(session.accessToken).GET("/me")).data!.data.attributes.email).toBe(
        email,
      );
      const replay = await postForm(path, form);
      expect(replay.status).toBe(200);
      expect(await replay.text()).toContain(
        prefix
          ? "The verification link is invalid or expired."
          : "인증 링크가 올바르지 않거나 만료되었습니다.",
      );
    },
    30000,
  );

  it("메일 링크 언어·누락·반복 토큰·검증 오류·요청 한도를 처리한다", async () => {
    const first = await fetch(`${base}/reset-password?token=invalid`, {
      headers: { "Accept-Language": "en" },
      redirect: "manual",
    });
    expect(first.status).toBe(307);
    expect(new URL(first.headers.get("location")!, base).pathname).toBe("/en/reset-password");
    expect(new URL(first.headers.get("location")!, base).search).toBe("?token=invalid");
    for (const path of ["/reset-password", "/reset-password?token=one&token=two"]) {
      const html = await (
        await fetch(`${base}${path}`, {
          headers: { Cookie: "NEXT_LOCALE=ko", "Accept-Language": "en" },
        })
      ).text();
      expect(html).toContain("인증 링크가 올바르지 않거나 만료되었습니다.");
      expect(html).not.toContain('name="password"');
    }
    const path = "/en/reset-password?token=invalid";
    const form = serverForm(await (await fetch(`${base}${path}`)).text(), "reset");
    form.body.set("password", "x"); // betterleaks:allow 검증 실패용 비밀번호
    const invalid = await postForm(path, form);
    expect(invalid.status).toBe(200);
    const html = await invalid.text();
    expect(html).toContain('aria-describedby="password-errors"');
    expect(html).toContain("Enter at least 8 characters.");
    expect(html).not.toContain('value="x"');
    const requestPath = "/en/forgot-password";
    const requestHtml = await (await fetch(`${base}${requestPath}`)).text();
    const email = `reset-http-limit-${randomUUID()}@example.com`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const request = serverForm(requestHtml, "request-reset");
      request.body.set("email", email);
      const response = await postForm(requestPath, request);
      expect(response.status).toBe(200);
      if (attempt === 3) expect(await response.text()).toMatch(/Try again in \d+ seconds\./);
    }
  });
});
