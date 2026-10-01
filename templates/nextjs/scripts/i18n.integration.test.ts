import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { mkdir, readFile, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { sealSession, unsealSession } from "../src/lib/session/cookie";
import { login, mockClient } from "./test/session";

const require = createRequire(import.meta.url);
let child: ChildProcess;
let base: string;
let output = "";
const probeDirectory = new URL("../src/app/[locale]/session-probe/", import.meta.url);
const probeFile = new URL("page.tsx", probeDirectory);
let probeCreated = false;
const nextTypes = new URL("../.next/dev/types/", import.meta.url);
const nextEnv = new URL("../next-env.d.ts", import.meta.url);
const typeSnapshot = new Map<string, Buffer>();
let nextEnvSnapshot: Buffer | undefined;

async function typeFiles() {
  try {
    return await readdir(nextTypes);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    return [];
  }
}

async function snapshotNextTypes() {
  for (const name of await typeFiles()) {
    typeSnapshot.set(name, await readFile(new URL(name, nextTypes)));
  }
  try {
    nextEnvSnapshot = await readFile(nextEnv);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

async function restoreNextTypes() {
  // 임시 페이지의 validator가 다음 tsc에서 없는 파일을 참조하지 않게 한다.
  for (const name of await typeFiles()) {
    if (!typeSnapshot.has(name)) await unlink(new URL(name, nextTypes));
  }
  for (const [name, content] of typeSnapshot) await writeFile(new URL(name, nextTypes), content);
  if (nextEnvSnapshot) await writeFile(nextEnv, nextEnvSnapshot);
  else {
    try {
      await unlink(nextEnv);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
}

// 실제 렌더링·Action 경계를 검사한 뒤 지운다. 제품에 진단 페이지를 넣지 않는다.
const probeSource = `
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createSessionApiClient } from "../../../lib/api/session-client";
import { readSession, redirectOnUnauthorized } from "../../../lib/session/request";

async function submit() {
  "use server";
  const locale = await getLocale();
  const path = locale === "en" ? "/en/session-probe" : "/session-probe";
  const client = await createSessionApiClient({ locale, log: () => {} });
  try { await client.GET("/me"); }
  catch (error) { redirectOnUnauthorized(error, path); throw error; }
  redirect(path + "?submitted=1");
}

export default async function Page() {
  const locale = await getLocale();
  const path = locale === "en" ? "/en/session-probe" : "/session-probe";
  const client = await createSessionApiClient({ locale, log: () => {} });
  try { await client.GET("/me"); }
  catch (error) { redirectOnUnauthorized(error, path); throw error; }
  const session = await readSession();
  return <section><p>session-authenticated</p><p>{session?.accessTokenExpiresAt}</p>
    <form action={submit}><button type="submit">Submit</button></form></section>;
}
`;

beforeAll(async () => {
  await snapshotNextTypes();
  await mkdir(probeDirectory);
  probeCreated = true;
  await writeFile(probeFile, probeSource, "utf8");
  const listener = createServer();
  listener.listen(0, "localhost");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("테스트 포트를 얻지 못했다.");
  const port = address.port;
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
  try {
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
  } finally {
    if (probeCreated) {
      await unlink(probeFile);
      await rmdir(probeDirectory);
      await restoreNextTypes();
    }
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

describe("§13 #3/#4/#5 실제 Next proxy·렌더링·Action", () => {
  it.each(["/session-probe", "/en/session-probe"])(
    "%s의 같은 렌더링이 응답 쿠키와 같은 새 만료 시각으로 인증된다",
    async (path) => {
      const old = {
        ...(await login()),
        accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
      };
      const response = await fetch(`${base}${path}`, {
        headers: sessionHeaders(await sealSession(old, EXAMPLE_SESSION_SECRET)),
        redirect: "manual",
      });
      expect(response.status).toBe(200);
      const session = await responseSession(response);
      const html = await response.text();
      expect(html).toContain("session-authenticated");
      expect(html).toContain(session.accessTokenExpiresAt);
      expect(html).not.toContain(old.accessTokenExpiresAt);
      expect(html).toContain(path.startsWith("/en") ? '<html lang="en">' : '<html lang="ko">');
      if (path.startsWith("/en"))
        expect(
          response.headers.getSetCookie().some((value) => value.startsWith("NEXT_LOCALE=en;")),
        ).toBe(true);
      expect((await mockClient(session.accessToken).GET("/me")).response.status).toBe(200);
    },
  );

  it("별도 HTTP proxy 호출과 늦은 옛 쿠키가 같은 갱신 결과를 공유한다", async () => {
    const old = {
      ...(await login()),
      accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
    };
    const headers = sessionHeaders(await sealSession(old, EXAMPLE_SESSION_SECRET));
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        fetch(`${base}/en/session-probe`, { headers, redirect: "manual" }),
      ),
    );
    responses.push(await fetch(`${base}/en/session-probe`, { headers, redirect: "manual" }));
    const sessions = [];
    for (const response of responses) {
      expect(response.status).toBe(200);
      const session = await responseSession(response);
      expect(await response.text()).toContain(session.accessTokenExpiresAt);
      sessions.push(session);
    }
    expect(new Set(sessions.map((session) => session.accessToken)).size).toBe(1);
    expect(new Set(sessions.map((session) => session.refreshToken)).size).toBe(1);
    expect((await mockClient(sessions[0]!.accessToken).GET("/me")).response.status).toBe(200);
  });

  it("JS 없는 Server Action POST도 proxy에서 갱신한 토큰으로 인증된다", async () => {
    const tokens = await login();
    const page = await fetch(`${base}/en/session-probe`, {
      headers: sessionHeaders(await sealSession(tokens, EXAMPLE_SESSION_SECRET)),
    });
    expect(page.status).toBe(200);
    const html = await page.text();
    const action = html.match(/name="(\$ACTION_ID_[^"]+)"/);
    if (!action?.[1]) throw new Error("서버 폼 Action ID가 없다.");
    const body = new FormData();
    body.set(action[1], "");
    const old = { ...tokens, accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString() };
    const response = await fetch(`${base}/en/session-probe`, {
      method: "POST",
      body,
      redirect: "manual",
      headers: { ...sessionHeaders(await sealSession(old, EXAMPLE_SESSION_SECRET)), Origin: base },
    });
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!, base).pathname).toBe("/en/session-probe");
    expect(new URL(response.headers.get("location")!, base).searchParams.get("submitted")).toBe(
      "1",
    );
    const session = await responseSession(response);
    expect(session.accessToken).not.toBe(tokens.accessToken);
    expect((await mockClient(session.accessToken).GET("/me")).response.status).toBe(200);
  });

  it("실패한 refresh는 HTTP 응답에서 쿠키를 지우고 영어 로그인으로 보낸다", async () => {
    const old = {
      ...(await login()),
      accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
    };
    await mockClient(old.accessToken).DELETE("/sessions/current");
    const response = await fetch(`${base}/en/session-probe`, {
      headers: sessionHeaders(await sealSession(old, EXAMPLE_SESSION_SECRET)),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!, base).pathname).toBe("/en/login");
    expect(response.headers.get("set-cookie")).toContain("session=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("렌더링의 실제 401은 정리 route를 거쳐 쿠키 삭제와 로그인으로 이어진다", async () => {
    const tokens = await login();
    const cookie = await sealSession(tokens, EXAMPLE_SESSION_SECRET);
    await mockClient(tokens.accessToken).DELETE("/sessions/current");
    const response = await fetch(`${base}/en/session-probe`, {
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
