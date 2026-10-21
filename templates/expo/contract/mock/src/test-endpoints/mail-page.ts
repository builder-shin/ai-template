/**
 * 테스트 통로: 메일 보관함 화면(/_mock/mail). MOCK_TEST_ENDPOINTS가 켜져 있을 때만 붙는다. 단독
 * 개발에서 Mailpit의 화면 대신 쓴다. 보관함은 /_test/mail(JSON, mail.ts)과 같은 것이다.
 *
 * - GET /_mock/mail: 보관한 메일을 최신순으로 보여 준다(받는 사람, 제목, 받은 시각, 본문). 본문의
 *   http(s) 주소는 누를 수 있는 링크다. 본문에는 사용자가 넣은 값(이름)도 들므로 모든 값을 이스케이프한다.
 * - POST /_mock/mail/clear: 보관함을 비우고 화면으로 돌아간다(303).
 */

import { Hono } from "hono";
import type { AppEnv } from "../context.ts";
import { escapeHtml, htmlPage } from "../html.ts";
import type { Outbox, StoredMail } from "../mail/outbox.ts";

/** 메일 보관함 화면의 경로. */
export const MAIL_PAGE_PATH = "/_mock/mail";

const TITLE = "메일 보관함 (목)";
/** 본문 안의 http(s) 주소. 공백, 꺾쇠, 따옴표에서 끝난다. */
const LINK = /https?:\/\/[^\s<>"']+/g;

const STYLE = `
body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
article { border-top: 1px solid #ccc; padding: 0.5rem 0 1rem; }
h2 { font-size: 1.1rem; margin: 0.5rem 0; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0 1rem; margin: 0; color: #555; font-size: 0.9rem; }
dd { margin: 0; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: inherit; background: #f6f6f6; padding: 0.75rem; }
button { padding: 0.4rem 1rem; font: inherit; }
.note { color: #555; font-size: 0.9rem; }`;

/** 본문: 이스케이프하고 http(s) 주소만 링크로 만든다. */
function linkify(text: string): string {
  let html = "";
  let rest = 0;
  for (const match of text.matchAll(LINK)) {
    const url = escapeHtml(match[0]);
    html += `${escapeHtml(text.slice(rest, match.index))}<a href="${url}">${url}</a>`;
    rest = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(rest));
}

/** 받은 시각(ISO 8601 UTC)을 읽기 쉽게 보여 준다. 예: 2026-09-30 01:02:03 UTC */
function receivedTime(receivedAt: string): string {
  const shown = `${receivedAt.slice(0, 10)} ${receivedAt.slice(11, 19)} UTC`;
  return `<time datetime="${escapeHtml(receivedAt)}">${escapeHtml(shown)}</time>`;
}

function mailArticle(mail: StoredMail): string {
  return `<article>
<h2>${escapeHtml(mail.subject)}</h2>
<dl><dt>받는 사람</dt><dd>${escapeHtml(mail.to)}</dd><dt>받은 시각</dt><dd>${receivedTime(mail.receivedAt)}</dd></dl>
<pre>${linkify(mail.text)}</pre>
</article>`;
}

/** 메일 보관함 화면. messages는 최신순이다. */
function mailPage(messages: readonly StoredMail[]): string {
  const note =
    '<p class="note">목 서버가 보낸 메일이다. 최신 메일이 위에 있고, 본문의 링크를 누르면 그 화면이 ' +
    "열린다. 메모리에 두므로 목을 다시 띄우면 비워진다.</p>";
  if (messages.length === 0) return htmlPage(TITLE, STYLE, `${note}\n<p>받은 메일이 없다.</p>`);
  const clear = `<form method="post" action="${MAIL_PAGE_PATH}/clear"><button type="submit">모두 지우기</button></form>`;
  return htmlPage(TITLE, STYLE, [note, clear, ...messages.map(mailArticle)].join("\n"));
}

export function mailPageRoutes(outbox: Outbox): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get("/", (c) => c.html(mailPage(outbox.list())));
  routes.post("/clear", (c) => {
    outbox.clear();
    return c.redirect(MAIL_PAGE_PATH, 303);
  });
  return routes;
}
