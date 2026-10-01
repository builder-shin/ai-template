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

function decode(value: string) {
  const entities: Record<string, string> = {
    "&quot;": '"',
    "&#x27;": "'",
    "&#39;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
  };
  return value.replace(/&quot;|&#x27;|&#39;|&lt;|&gt;|&amp;/g, (match) => entities[match]!);
}

/** 실제 SSR 폼의 hidden 필드와 action을 쓴다. JS·Action ID 대체는 없다. */
function serverForm(html: string, kind: "login" | "logout" | "resend") {
  const form = Array.from(html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)).find((match) =>
    kind === "logout"
      ? match[1]!.includes('id="logout-form"')
      : kind === "login"
        ? /type="email"/.test(match[2]!)
        : /name="email"/.test(match[2]!) && !/type="email"/.test(match[2]!),
  );
  if (!form) throw new Error(`${kind} 서버 폼이 없다.`);
  const body = new FormData();
  for (const input of form[2]!.matchAll(/<input\b[^>]*>/g)) {
    const attributes = Object.fromEntries(
      Array.from(input[0].matchAll(/([\w$:-]+)="([^"]*)"/g), (entry) => [
        entry[1],
        decode(entry[2]!),
      ]),
    );
    if (attributes.type === "hidden" && attributes.name)
      body.append(attributes.name, attributes.value ?? "");
  }
  expect(Array.from(body.keys()).some((name) => name.startsWith("$ACTION_"))).toBe(true);
  const action = form[1]!.match(/action="([^"]*)"/)?.[1];
  return { body, action: action ? decode(action) : "" };
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
