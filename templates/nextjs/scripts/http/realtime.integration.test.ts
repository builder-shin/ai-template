import { appSessionCookieName } from "../../src/lib/app-config.mjs";
import { chromium, expect as playwrightExpect, type Page, type WebSocket } from "@playwright/test";
import { expect, inject, it, vi } from "vitest";
import { sessionsFixture } from "../../src/features/sessions/test-fixture";
import { sealSession } from "../../src/lib/session/cookie";
import { EXAMPLE_SESSION_SECRET } from "../../src/lib/env";
import en from "../../messages/en.json";

vi.setConfig({ testTimeout: 60000 });
const browserExpect = playwrightExpect.configure({ timeout: 30000 });

/** 개발 Strict Mode의 첫 연결은 정리된다. 실제 인증·구독을 마친 연결을 기다린다. */
function waitForRealtime(page: Page, subscribed: boolean) {
  return new Promise<WebSocket>((resolve, reject) => {
    const timer = setTimeout(() => {
      page.off("websocket", listen);
      reject(new Error("실시간 연결의 ack가 없다."));
    }, 30000);
    const listen = (socket: WebSocket) => {
      if (new URL(socket.url()).pathname !== "/socket.io/") return;
      socket.on("framereceived", (frame) => {
        const data = String(frame.payload);
        if (subscribed ? data.includes('"ok":true') : data.startsWith("40")) {
          clearTimeout(timer);
          page.off("websocket", listen);
          resolve(socket);
        }
      });
    };
    page.on("websocket", listen);
  });
}

/** 프레임 본문은 보관하지 않고 draft 변경의 글 id만 확인한다. */
function observeDraftUpdates(page: Page) {
  const received = new Set<string>();
  const listeners = new Set<(id: string) => void>();
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname !== "/socket.io/") return;
    socket.on("framereceived", ({ payload }) => {
      const frame = String(payload).match(/^42\d*(\[.*)$/);
      if (!frame) return;
      const [name, document] = JSON.parse(frame[1]!) as [string, { data: { id: string } }];
      if (name !== "post.updated") return;
      received.add(document.data.id);
      for (const listener of listeners) listener(document.data.id);
    });
  });
  return {
    received,
    wait(id: string) {
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(receive);
          reject(new Error("작성자 방의 draft 변경이 도착하지 않았다."));
        }, 30000);
        const receive = (updated: string) => {
          if (updated !== id) return;
          clearTimeout(timer);
          listeners.delete(receive);
          resolve();
        };
        listeners.add(receive);
      });
    },
  };
}

it("로그아웃 없이 A에서 B로 로그인하면 이전 draft는 받지 않고 B의 방을 받는다", async () => {
  const owner = await sessionsFixture("en");
  const replacement = await sessionsFixture("en");
  const { data: me } = await replacement.client.GET("/me");
  const draft = async (account: typeof owner) =>
    (
      await account.client.POST("/posts", {
        body: {
          data: {
            type: "posts",
            attributes: { title: `Private ${account.id}`, body: "Private draft", status: "draft" },
          },
        },
      })
    ).data!.data;
  const a = await draft(owner);
  const b = await draft(replacement);
  const change = (account: typeof owner, id: string) =>
    account.client.PATCH("/posts/{id}", {
      params: { path: { id } },
      body: { data: { type: "posts", id, attributes: { body: "Changed private draft" } } },
    });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ locale: "en-US" });
    await context.addCookies([
      {
        name: appSessionCookieName("development"),
        value: await sealSession({ ...owner.session, sessionId: owner.id }, EXAMPLE_SESSION_SECRET),
        url: inject("httpBaseUrl"),
      },
      { name: "NEXT_LOCALE", value: "en", url: inject("httpBaseUrl") },
    ]);
    const page = await context.newPage();
    const updates = observeDraftUpdates(page);
    const connected = waitForRealtime(page, false);
    await page.goto(`${inject("httpBaseUrl")}/en/login?returnTo=%2Fen%2Fposts`);
    await connected;
    const initial = updates.wait(a.id);
    await change(owner, a.id);
    await initial;
    updates.received.clear();
    let documents = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
    });
    const rebound = waitForRealtime(page, false);
    await page.getByLabel(en.auth.email, { exact: true }).fill(me!.data.attributes.email!);
    await page.getByLabel(en.auth.passwordLabel, { exact: true }).fill("sessions-test-password"); // betterleaks:allow 사유: 실제 목 fixture의 테스트 비밀번호
    await page.getByRole("button", { name: en.auth.login, exact: true }).click();
    await browserExpect(page).toHaveURL(`${inject("httpBaseUrl")}/en/posts`);
    await rebound;
    const receivedB = updates.wait(b.id);
    await change(owner, a.id);
    await change(replacement, b.id);
    await receivedB;
    expect(updates.received.has(a.id)).toBe(false);
    expect(updates.received.has(b.id)).toBe(true);
    expect(documents).toBe(0);
  } finally {
    await browser.close();
    await owner.stop();
    await replacement.stop();
  }
});

it("실제 브라우저의 공개 채널은 목록·상세·404 뒤 안내를 반영한다", async () => {
  const owner = await sessionsFixture();
  const post = (
    await owner.client.POST("/posts", {
      body: {
        data: {
          type: "posts",
          attributes: { title: `실시간-${owner.id}`, body: "실시간 본문", status: "draft" },
        },
      },
    })
  ).data!.data;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ locale: "ko-KR" });
    await context.addCookies([
      {
        name: appSessionCookieName("development"),
        value: await sealSession({ ...owner.session, sessionId: owner.id }, EXAMPLE_SESSION_SECRET),
        url: inject("httpBaseUrl"),
      },
    ]);
    const page = await context.newPage();
    const updates = observeDraftUpdates(page);
    const websocket = waitForRealtime(page, true);
    await page.goto(
      `${inject("httpBaseUrl")}/posts?q=${encodeURIComponent(post.attributes.title)}`,
    );
    const socket = await websocket;
    const change = async (status: "published" | "draft") =>
      owner.client.PATCH("/posts/{id}", {
        params: { path: { id: post.id } },
        body: { data: { type: "posts", id: post.id, attributes: { status } } },
      });
    await change("published");
    await browserExpect(page.getByRole("link", { name: post.attributes.title })).toBeVisible();
    // SSR 제목보다 채널 구독 ack가 상세 화면의 준비를 정확히 나타낸다.
    const detailSubscribed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off("framereceived", receive);
        reject(new Error("상세 채널 구독 실패"));
      }, 30000);
      const receive = (frame: { payload: string | Buffer }) => {
        if (String(frame.payload).includes('"ok":true')) {
          clearTimeout(timer);
          socket.off("framereceived", receive);
          resolve();
        }
      };
      socket.on("framereceived", receive);
    });
    await page.getByRole("link", { name: post.attributes.title }).click();
    await browserExpect(page.getByRole("heading", { name: post.attributes.title })).toBeVisible();
    await detailSubscribed;
    await change("draft");
    await browserExpect(page.locator("main").getByRole("alert")).toHaveText(
      "이 글의 발행이 취소되었습니다.",
    );
    await browserExpect(page.getByText("실시간 본문", { exact: true })).toHaveCount(0);
    const draftUpdated = updates.wait(post.id);
    const draftRefreshed = page.waitForResponse(
      (response) =>
        response.request().headers()["rsc"] === "1" &&
        new URL(response.url()).pathname === `/posts/${post.id}`,
    );
    await owner.client.PATCH("/posts/{id}", {
      params: { path: { id: post.id } },
      body: {
        data: { type: "posts", id: post.id, attributes: { body: "작성자만 받는 draft 본문" } },
      },
    });
    await draftUpdated;
    await (await draftRefreshed).finished();
    await browserExpect(page.locator("main").getByRole("alert")).toHaveText(
      "이 글의 발행이 취소되었습니다.",
    );
    await browserExpect(page.getByText("작성자만 받는 draft 본문", { exact: true })).toHaveCount(0);
    await change("published");
    await browserExpect(page.getByRole("heading", { name: post.attributes.title })).toBeVisible();
    await browserExpect(page.getByText("작성자만 받는 draft 본문", { exact: true })).toBeVisible();
    await owner.client.DELETE("/posts/{id}", { params: { path: { id: post.id } } });
    await browserExpect(page.locator("main").getByRole("alert")).toHaveText(
      "이 글이 삭제되었습니다.",
    );
    await browserExpect(page.getByRole("link", { name: "글 목록", exact: true })).toBeVisible();
  } finally {
    await browser.close();
    await owner.client.DELETE("/posts/{id}", { params: { path: { id: post.id } } }).catch(() => {});
    await owner.stop();
  }
});

it("실제 브라우저는 폐기된 세션 쿠키를 지우고 로그인으로 간다", async () => {
  const owner = await sessionsFixture("en");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ locale: "en-US" });
    await context.addCookies([
      {
        name: appSessionCookieName("development"),
        value: await sealSession(owner.session, EXAMPLE_SESSION_SECRET),
        url: inject("httpBaseUrl"),
      },
      { name: "NEXT_LOCALE", value: "en", url: inject("httpBaseUrl") },
    ]);
    const page = await context.newPage();
    const connected = waitForRealtime(page, false);
    await page.goto(`${inject("httpBaseUrl")}/en/posts`);
    await connected;
    const other = await owner.login();
    await other.client.DELETE("/sessions/{id}", { params: { path: { id: owner.id } } });
    await browserExpect(page).toHaveURL(/\/en\/login\?/);
    expect(
      (await context.cookies()).some(
        (cookie) => cookie.name === appSessionCookieName("development"),
      ),
    ).toBe(false);
  } finally {
    await browser.close();
    await owner.stop();
  }
});
