import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { sealSession, unsealSession } from "../src/lib/session/cookie";
import { login, mockClient } from "./test/session";
import { serverForm } from "./test/forms";

const require = createRequire(import.meta.url);
let child: ChildProcess;
let base: string;
let output = "";
beforeAll(async () => {
  const listener = createServer();
  listener.listen(0, "localhost");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("테스트 포트를 얻지 못했다.");
  const port = address.port;
  if (port === 3000 || port === 4010) throw new Error("개발 포트를 테스트에 쓰지 않는다.");
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  base = `http://localhost:${port}`;
  child = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "dev",
      "--hostname",
      "localhost",
      "--port",
      String(port),
    ],
    {
      cwd: new URL("../", import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEXT_TELEMETRY_DISABLED: "1",
        API_BASE_URL: `${inject("mockBaseUrl")}/api/v1`,
        APP_URL: base,
        SESSION_SECRET: EXAMPLE_SESSION_SECRET,
        TIME_ZONE: "America/New_York",
        NEXT_PUBLIC_REALTIME_URL: inject("mockBaseUrl"),
      },
      windowsHide: true,
      detached: process.platform !== "win32",
    },
  );
  child.stdout?.on("data", (data) => {
    output += data;
  });
  child.stderr?.on("data", (data) => {
    output += data;
  });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      const response = await fetch(base, {
        headers: { "Accept-Language": "ko" },
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 200) return;
    } catch {
      /* 서버가 준비될 때까지 기다린다. */
    }
    await setTimeout(100);
  }
  throw new Error(`Next 테스트 서버 시작 실패:\n${output}`);
}, 75000);

afterAll(async () => {
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit", { signal: AbortSignal.timeout(10000) });
    // 직접 시작한 서버 트리만 종료한다.
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else process.kill(-child.pid, "SIGTERM");
    await exited;
  }
});

function sessionHeaders(value: string) {
  return { Cookie: `session=${value}; NEXT_LOCALE=ko`, "Accept-Language": "ko" };
}

async function responseSession(response: Response) {
  const header = response.headers.getSetCookie().find((value) => value.startsWith("session="));
  const value = header?.split(";", 1)[0]?.slice("session=".length);
  if (!value) throw new Error("응답에 새 세션 쿠키가 없다.");
  const session = await unsealSession(value, EXAMPLE_SESSION_SECRET);
  if (!session) throw new Error("응답 세션을 복호화하지 못했다.");
  return session;
}

async function postForm(path: string, form: ReturnType<typeof serverForm>, cookie?: string) {
  return fetch(new URL(form.action || path, base), {
    method: "POST",
    body: form.body,
    redirect: "manual",
    headers: { Origin: base, "Accept-Language": "ko", ...(cookie ? sessionHeaders(cookie) : {}) },
  });
}

describe("§13 #3/#4/#5 실제 페이지·헤더·로그아웃 Action", () => {
  it.each(["/", "/en"])(
    "%s의 같은 렌더링은 거절된 옛 토큰 대신 갱신 토큰으로 헤더를 읽는다",
    async (path) => {
      const old = {
        ...(await login()),
        accessToken: "rejected-old-access",
        accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
      };
      const response = await fetch(`${base}${path}`, {
        headers: sessionHeaders(await sealSession(old, EXAMPLE_SESSION_SECRET)),
        redirect: "manual",
      });
      expect(response.status).toBe(200);
      const session = await responseSession(response);
      const html = await response.text();
      expect(html).toContain(path === "/en" ? "User menu: Admin" : "사용자 메뉴: Admin");
      expect(html).toContain(path === "/en" ? '<html lang="en">' : '<html lang="ko">');
      expect(html).not.toContain(session.accessToken);
      expect(html).not.toContain(session.refreshToken);
      expect(session.accessToken).not.toBe(old.accessToken);
      if (path === "/en")
        expect(
          response.headers.getSetCookie().some((value) => value.startsWith("NEXT_LOCALE=en;")),
        ).toBe(true);
      expect((await mockClient(session.accessToken).GET("/me")).response.status).toBe(200);
    },
  );

  it("별도 HTTP proxy 호출과 늦은 옛 쿠키가 같은 갱신 결과를 공유한다", async () => {
    const old = {
      ...(await login()),
      accessToken: "rejected-old-access",
      accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
    };
    const headers = sessionHeaders(await sealSession(old, EXAMPLE_SESSION_SECRET));
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => fetch(`${base}/en`, { headers, redirect: "manual" })),
    );
    responses.push(await fetch(`${base}/en`, { headers, redirect: "manual" }));
    const sessions = [];
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("User menu: Admin");
      sessions.push(await responseSession(response));
    }
    expect(new Set(sessions.map((session) => session.accessToken)).size).toBe(1);
    expect(new Set(sessions.map((session) => session.refreshToken)).size).toBe(1);
    expect((await mockClient(sessions[0]!.accessToken).GET("/me")).response.status).toBe(200);
  });

  it("JS 없는 로그아웃 POST는 proxy에서 갱신한 토큰으로 실제 세션을 폐기한다", async () => {
    const tokens = await login();
    const page = await fetch(`${base}/en`, {
      headers: sessionHeaders(await sealSession(tokens, EXAMPLE_SESSION_SECRET)),
    });
    expect(page.status).toBe(200);
    const form = serverForm(await page.text(), "logout");
    const old = {
      ...tokens,
      accessToken: "rejected-old-access",
      accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
    };
    const response = await postForm("/en", form, await sealSession(old, EXAMPLE_SESSION_SECRET));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!, base).pathname).toBe("/en");
    expect(response.headers.get("set-cookie")).toContain("session=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    // 옛 토큰으로 DELETE했다면 세션이 살아 있어 이 조회가 성공한다.
    await expect(mockClient(tokens.accessToken).GET("/me")).rejects.toMatchObject({ status: 401 });
  });

  it("실패한 refresh는 HTTP 응답에서 쿠키를 지우고 영어 로그인으로 보낸다", async () => {
    const old = {
      ...(await login()),
      accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
    };
    await mockClient(old.accessToken).DELETE("/sessions/current");
    const response = await fetch(`${base}/en`, {
      headers: sessionHeaders(await sealSession(old, EXAMPLE_SESSION_SECRET)),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!, base).pathname).toBe("/en/login");
    expect(response.headers.get("set-cookie")).toContain("session=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("헤더 렌더링의 실제 401은 정리 route에서 쿠키를 지우고 로그인으로 이어진다", async () => {
    const tokens = await login();
    const cookie = await sealSession(tokens, EXAMPLE_SESSION_SECRET);
    await mockClient(tokens.accessToken).DELETE("/sessions/current");
    const response = await fetch(`${base}/en`, {
      headers: sessionHeaders(cookie),
      redirect: "manual",
    });
    expect(response.status).toBe(307);
    const clearUrl = new URL(response.headers.get("location")!, base);
    expect(clearUrl.pathname).toBe("/session/clear");
    const cleared = await fetch(clearUrl, { headers: sessionHeaders(cookie), redirect: "manual" });
    expect(cleared.status).toBe(303);
    expect(cleared.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(new URL(cleared.headers.get("location")!, base).pathname).toBe("/en/login");
  });
});

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
      expect(reset.headers.get("set-cookie")).toContain("session=;");
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
});

describe("실제 Next 서버의 로케일 렌더링", () => {
  it.each([
    ["/", "ko", "Web 템플릿"],
    ["/en", "en", "Web template"],
  ])("%s는 %s HTML과 번역을 렌더링한다", async (path, locale, title) => {
    const response = await fetch(`${base}${path}`, { headers: { "Accept-Language": "ko" } });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<html lang="${locale}">`);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${title}</h1>`));
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain("America/New_York");
  });

  it("첫 방문은 Accept-Language로 영어 URL을 고르고 영어 화면을 렌더링한다", async () => {
    const first = await fetch(base, {
      headers: { "Accept-Language": "en-US,en;q=0.9,ko;q=0.5" },
      redirect: "manual",
    });
    expect(first.status).toBe(307);
    const destination = new URL(first.headers.get("location")!, base);
    expect(destination.href).toBe(`${base}/en`);
    const page = await fetch(destination, {
      headers: { "Accept-Language": "ko" },
    });
    expect(page.headers.get("set-cookie")).toContain("NEXT_LOCALE=en");
    expect(await page.text()).toMatch(/<h1[^>]*>Web template<\/h1>/);
  });

  it("다음 방문에는 헤더보다 NEXT_LOCALE 쿠키를 따른다", async () => {
    const response = await fetch(base, {
      headers: { "Accept-Language": "en", Cookie: "NEXT_LOCALE=ko" },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/<h1[^>]*>Web 템플릿<\/h1>/);
  });
});
