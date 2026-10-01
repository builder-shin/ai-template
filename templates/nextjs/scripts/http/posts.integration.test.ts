import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { JSDOM } from "jsdom";
import { postFixture } from "../../src/features/posts/test-fixture";
import { base } from "./helpers";
import { sealSession } from "../../src/lib/session/cookie";
import { EXAMPLE_SESSION_SECRET } from "../../src/lib/env";

function parseHtml(html: string) {
  const dom = new JSDOM();
  const document = new dom.window.DOMParser().parseFromString(html, "text/html");
  dom.window.close();
  return document;
}

describe("ko/en 공개 글 HTTP 화면", () => {
  let fixture: Awaited<ReturnType<typeof postFixture>>;
  let cookie: string;
  beforeAll(async () => {
    fixture = await postFixture();
    cookie = `session=${await sealSession(fixture.session, EXAMPLE_SESSION_SECRET)}`;
  });
  afterAll(async () => {
    await fixture?.stop();
  });
  it.each(["ko", "en"] as const)(
    "%s 목록·상세 HTML과 GET 검색·정렬·페이지 이동을 확인한다",
    async (locale) => {
      const prefix = locale === "en" ? "/en" : "";
      const headers = { "Accept-Language": locale };
      const response = await fetch(`${base}${prefix}/posts?q=${fixture.prefix}&sort=title&size=1`, {
        headers,
      });
      expect(response.status).toBe(200);
      // 후속 스트림 조각까지 파싱하되 스크립트는 실행하지 않는다.
      const document = parseHtml(await response.text());
      expect(document.documentElement.lang).toBe(locale);
      expect(document.querySelector("h1")?.textContent).toBe(locale === "ko" ? "글" : "Posts");
      expect(document.querySelector('form[method="get"]')).toBeTruthy();
      expect(document.querySelector(`a[href="${prefix}/posts/${fixture.a.id}"]`)).toBeTruthy();
      const form = document.querySelector('form[method="get"]')!;
      const search = new URL(form.getAttribute("action")!, base);
      search.search = new URLSearchParams({
        q: `${fixture.prefix} Z`,
        sort: "title",
        size: "1",
      }).toString();
      const searched = parseHtml(await (await fetch(search, { headers })).text());
      expect(searched.querySelector(`a[href="${prefix}/posts/${fixture.z.id}"]`)).toBeTruthy();
      expect(searched.querySelector(`a[href="${prefix}/posts/${fixture.a.id}"]`)).toBeNull();
      const next = [...document.querySelectorAll("a")].find(
        (link) => link.textContent === (locale === "ko" ? "다음" : "Next"),
      )!;
      const page2 = await fetch(new URL(next.getAttribute("href")!, base), { headers });
      expect(await page2.text()).toContain(fixture.m.attributes.title);
      const detail = await fetch(`${base}${prefix}/posts/${fixture.z.id}`, { headers });
      expect(detail.status).toBe(200);
      const detailDocument = parseHtml(await detail.text());
      const main = detailDocument.querySelector("article")!;
      expect(main.querySelector("h1")?.textContent).toBe(fixture.z.attributes.title);
      expect(main.querySelector("strong")?.textContent).toBe("굵게");
      expect(main.textContent).toContain("Admin");
      expect(detailDocument.querySelector("img")?.getAttribute("src")).toContain("/_storage/");
      expect(main.querySelector("script")).toBeNull();
      const home = await fetch(`${base}${prefix || "/"}`, { headers });
      expect(await home.text()).toContain(`href="${prefix}/posts"`);
    },
    30000,
  );
  it.each(["ko", "en"] as const)(
    "%s 없는 글·초안은 로그인한 작성자에게도 not-found다",
    async (locale) => {
      const prefix = locale === "en" ? "/en" : "";
      for (const id of [fixture.draft.id, randomUUID(), "missing"]) {
        const response = await fetch(`${base}${prefix}/posts/${id}`, {
          headers: { "Accept-Language": locale, Cookie: cookie },
        });
        const html = await response.text();
        // loading.tsx가 먼저 스트리밍하면 Next는 200과 noindex로 not-found를 전한다.
        expect([200, 404]).toContain(response.status);
        expect(html).toContain(locale === "ko" ? "페이지를 찾을 수 없습니다" : "Page not found");
        expect(html).toContain('name="robots" content="noindex"');
        expect(parseHtml(html).querySelector("article")).toBeNull();
        expect(parseHtml(html).body.textContent).not.toContain(fixture.draft.attributes.title);
      }
    },
    30000,
  );
});
