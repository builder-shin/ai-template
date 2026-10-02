import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { base } from "./helpers";

describe("실제 Next 서버의 로케일 렌더링", () => {
  it.each([
    ["en", "/en/posts", "ko", "/ko/posts", 307],
    ["ko", "/posts", "en", "/en/posts", 200],
  ] as const)(
    "%s HTML의 %s 전환 링크는 JS 없이 쿼리와 선택 쿠키를 유지한다",
    async (locale, path, target, targetPath, status) => {
      const query = "?q=locale-e2e&sort=title";
      const headers = {
        Cookie: `NEXT_LOCALE=${locale}`,
        "Accept-Language": "ko",
        "Sec-Fetch-Dest": "document",
      };
      const source = await fetch(`${base}${path}${query}`, { headers });
      expect(source.status).toBe(200);
      const dom = new JSDOM(await source.text());
      const href = dom.window.document
        .querySelector(`nav a[lang="${target}"]`)
        ?.getAttribute("href");
      dom.window.close();
      expect(href).toBe(`${targetPath}${query}`);
      const switched = await fetch(new URL(href!, base), { headers, redirect: "manual" });
      expect(switched.status).toBe(status);
      expect(switched.headers.get("set-cookie")).toContain(`NEXT_LOCALE=${target}`);
      if (target === "ko") {
        expect(new URL(switched.headers.get("location")!, base).href).toBe(`${base}/posts${query}`);
        const destination = await fetch(new URL(switched.headers.get("location")!, base), {
          headers: { ...headers, Cookie: "NEXT_LOCALE=ko" },
          redirect: "manual",
        });
        expect(destination.status).toBe(200);
        expect(await destination.text()).toContain('<html lang="ko">');
      } else {
        expect(await switched.text()).toContain('<html lang="en">');
      }
    },
  );

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
