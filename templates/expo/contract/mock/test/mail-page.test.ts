/** 메일 보관함 화면(/_mock/mail): 최신순 목록, 누를 수 있는 링크, 이스케이프, 비우기, 테스트 통로 설정. */

import { describe, expect, it } from "vitest";
import { testApp } from "./support.ts";

type App = ReturnType<typeof testApp>["app"];

async function page(app: App): Promise<string> {
  const response = await app.request("/_mock/mail");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/html; charset=UTF-8");
  return response.text();
}

describe("/_mock/mail", () => {
  it("보관한 메일을 최신순으로 받는 사람, 제목, 받은 시각, 본문과 함께 보여 준다", async () => {
    const { app, state } = testApp();
    const older = state.outbox.send({
      to: "a@example.com",
      subject: "먼저 보낸 메일",
      text: "첫째",
    });
    state.outbox.send({ to: "b@example.com", subject: "나중에 보낸 메일", text: "둘째" });
    const html = await page(app);
    expect(html).toContain("<title>메일 보관함 (목)</title>");
    expect(html.indexOf("나중에 보낸 메일")).toBeLessThan(html.indexOf("먼저 보낸 메일"));
    expect(html).toContain("<h2>먼저 보낸 메일</h2>");
    expect(html).toContain("<dt>받는 사람</dt><dd>a@example.com</dd>");
    const shown = `${older.receivedAt.slice(0, 10)} ${older.receivedAt.slice(11, 19)} UTC`;
    expect(html).toContain(
      `<dt>받은 시각</dt><dd><time datetime="${older.receivedAt}">${shown}</time>`,
    );
    expect(html).toContain("<pre>첫째</pre>");
  });

  it("본문의 http(s) 주소를 누를 수 있는 링크로 만든다", async () => {
    const { app, state } = testApp();
    const link = "http://localhost:3000/verify-email?token=abc"; // betterleaks:allow 테스트용 가짜 토큰
    state.outbox.send({
      to: "a@example.com",
      subject: "인증",
      text: `안녕하세요.\n\n${link}\n\n끝.`,
    });
    const html = await page(app);
    expect(html).toContain(`<pre>안녕하세요.\n\n<a href="${link}">${link}</a>\n\n끝.</pre>`);
  });

  it("모든 값을 이스케이프하고 http(s)가 아닌 주소는 링크로 만들지 않는다", async () => {
    const { app, state } = testApp();
    state.outbox.send({
      to: '"<b>"@example.com',
      subject: "<script>alert(1)</script>",
      text:
        "안녕하세요, <img src=x onerror=alert(1)>님.\njavascript:alert(1)\n" +
        'https://example.com/a?x=1&y=2"onclick="alert(1)',
    });
    const html = await page(app);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("<h2>&lt;script&gt;alert(1)&lt;/script&gt;</h2>");
    expect(html).toContain("<dd>&quot;&lt;b&gt;&quot;@example.com</dd>");
    expect(html).toContain("\njavascript:alert(1)\n");
    const url = "https://example.com/a?x=1&amp;y=2";
    expect(html).toContain(`<a href="${url}">${url}</a>&quot;onclick=&quot;alert(1)</pre>`);
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("보관함이 비었으면 그렇다고 알리고 지우기 버튼을 두지 않는다", async () => {
    const { app } = testApp();
    const html = await page(app);
    expect(html).toContain("<p>받은 메일이 없다.</p>");
    expect(html).not.toContain("<form");
  });

  it("모두 지우기는 보관함을 비우고 화면으로 돌아간다", async () => {
    const { app, state } = testApp();
    state.outbox.send({ to: "a@example.com", subject: "제목", text: "본문" });
    expect(await page(app)).toContain(
      '<form method="post" action="/_mock/mail/clear"><button type="submit">모두 지우기</button></form>',
    );
    const response = await app.request("/_mock/mail/clear", { method: "POST" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/_mock/mail");
    expect(state.outbox.list()).toEqual([]);
  });

  it("MOCK_TEST_ENDPOINTS가 꺼져 있으면 없는 경로다", async () => {
    const { app } = testApp({ testEndpoints: false });
    for (const [path, method] of [
      ["/_mock/mail", "GET"],
      ["/_mock/mail/clear", "POST"],
    ] as const) {
      const response = await app.request(path, { method });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not Found" });
    }
  });
});
