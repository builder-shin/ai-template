import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import { base, mockClient, postForm, responseSession, serverForm } from "./helpers";

describe("§13 #8 로케일 경로에서 JS 없이 실제 useActionState 폼 제출", () => {
  it("미인증 로그인 뒤 JS 없는 재발송도 안내를 유지하고 실제 메일을 보낸다", async () => {
    const email = `nojs-${randomUUID()}@example.com`;
    await mockClient().POST("/registrations", {
      body: {
        data: {
          type: "registrations",
          attributes: {
            name: "No JS user",
            email,
            password: "nojs-test-password", // betterleaks:allow 테스트 비밀번호
          },
        },
      },
    });
    const path = "/en/login";
    const form = serverForm(await (await fetch(`${base}${path}`)).text(), "login");
    form.body.set("email", email);
    form.body.set("password", "nojs-test-password"); // betterleaks:allow 테스트 비밀번호
    const failed = await postForm(path, form);
    expect(failed.status).toBe(200);
    const html = await failed.text();
    expect(html).toContain("Open the verification link in your email.");
    const resent = await postForm(path, serverForm(html, "resend"));
    expect(resent.status).toBe(200);
    expect(await resent.text()).toContain("Verification email sent. Check your inbox.");
    const mail = (await (
      await fetch(`${inject("mockBaseUrl")}/_test/mail?to=${encodeURIComponent(email)}`)
    ).json()) as { messages: unknown[] };
    expect(mail.messages).toHaveLength(2);
  });
  it.each(["/login?returnTo=%2Fen%3Ffrom%3Dlogin", "/en/login?returnTo=%2Fen%3Ffrom%3Dlogin"])(
    "%s 로그인은 쿠키·계정 로케일을 맞추고 303으로 이동한다",
    async (path) => {
      const page = await fetch(`${base}${path}`, { headers: { "Accept-Language": "ko" } });
      expect(page.status).toBe(200);
      const form = serverForm(await page.text(), "login");
      form.body.set("email", "admin@example.com");
      form.body.set("password", "admin-password"); // betterleaks:allow 테스트 시드
      const response = await postForm(path, form);
      expect(response.status).toBe(303);
      expect(new URL(response.headers.get("location")!, base).pathname).toBe("/");
      expect(new URL(response.headers.get("location")!, base).search).toBe("?from=login");
      expect(response.headers.get("set-cookie")).toContain("NEXT_LOCALE=ko");
      const session = await responseSession(response);
      expect((await mockClient(session.accessToken).GET("/me")).response.status).toBe(200);
    },
  );

  it("JS 없는 입력 오류 POST는 200 HTML에 field error를 연결한다", async () => {
    const path = "/en/login";
    const form = serverForm(await (await fetch(`${base}${path}`)).text(), "login");
    form.body.set("email", "invalid");
    form.body.set("password", "wrong"); // betterleaks:allow 검증 실패용 비밀번호
    const response = await postForm(path, form);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('aria-describedby="email-errors"');
    expect(html).toContain("Enter a value in the correct format.");
    expect(html).not.toContain('value="wrong"');
    expect(response.headers.getSetCookie().some((value) => value.startsWith("session="))).toBe(
      false,
    );
  });
});
