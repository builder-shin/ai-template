import { appSessionCookieName } from "../../src/lib/app-config.mjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { myPostFixture } from "../../src/features/posts/my-post-fixture";
import { sealSession } from "../../src/lib/session/cookie";
import { EXAMPLE_SESSION_SECRET } from "../../src/lib/env";
import { base } from "./helpers";

function document(html: string) {
  const dom = new JSDOM(html);
  const result = dom.window.document;
  dom.window.close();
  return result;
}
function form(html: string, id: string) {
  const element = document(html).getElementById(id)! as HTMLFormElement;
  expect(element).toBeTruthy();
  const body = new FormData();
  for (const input of element.querySelectorAll<HTMLInputElement>('input[type="hidden"]'))
    body.append(input.name, input.value);
  expect([...body.keys()].some((name) => name.startsWith("$ACTION_"))).toBe(true);
  return { body, action: element.getAttribute("action")! };
}

describe("ko/en 내 글 폼의 JS 없는 HTTP 흐름", () => {
  const fixtures: Awaited<ReturnType<typeof myPostFixture>>[] = [];
  beforeAll(async () => {
    for (const locale of ["ko", "en"] as const) fixtures.push(await myPostFixture(locale));
  });
  afterAll(async () => {
    for (const fixture of fixtures) await fixture.stop();
  });
  it.each(["ko", "en"] as const)(
    "%s 작성·검증 오류·수정·발행·취소·삭제 확인",
    async (locale) => {
      const fixture = fixtures[locale === "ko" ? 0 : 1]!;
      const prefix = locale === "en" ? "/en" : "";
      const headers = {
        Cookie: `${appSessionCookieName("development")}=${await sealSession(fixture.session, EXAMPLE_SESSION_SECRET)}; NEXT_LOCALE=${locale}`,
        "Accept-Language": locale,
        Origin: base,
      };
      const get = async (path: string) =>
        (await fetch(`${base}${prefix}${path}`, { headers })).text();
      const post = async (path: string, input: ReturnType<typeof form>) =>
        fetch(new URL(input.action || `${prefix}${path}`, base), {
          method: "POST",
          body: input.body,
          headers,
          redirect: "manual",
        });
      const newHtml = await get("/my-posts/new");
      expect(document(newHtml).querySelector("h1")?.textContent).toBe(
        locale === "ko" ? "글 작성" : "New post",
      );
      const bodyInput = document(newHtml).querySelector('form textarea[name="body"]')!;
      expect(bodyInput).toBeTruthy();
      const writePanel = bodyInput.closest('[role="tabpanel"]')!;
      expect(writePanel).toBeTruthy();
      expect(writePanel.hasAttribute("hidden")).toBe(false);
      expect(writePanel.hasAttribute("inert")).toBe(false);
      const invalid = form(newHtml, "post-editor");
      invalid.body.set("title", "");
      invalid.body.set("body", "남길 본문");
      const failed = await post("/my-posts/new", invalid);
      expect(failed.status).toBe(200);
      const failedHtml = await failed.text();
      expect(
        document(failedHtml).querySelector('[name="title"]')?.getAttribute("aria-invalid"),
      ).toBe("true");
      expect(document(failedHtml).querySelector("textarea")?.textContent).toBe("남길 본문");
      const create = form(failedHtml, "post-editor");
      create.body.set("title", fixture.prefix);
      create.body.set("body", "**작성 본문**");
      const created = await post("/my-posts/new", create);
      expect(created.status).toBe(303);
      const editPath = new URL(created.headers.get("location")!, base).pathname;
      expect(editPath).toMatch(new RegExp(`^${prefix}/my-posts/[^/]+/edit$`));
      const id = editPath.split("/").at(-2)!;
      const path = `/my-posts/${id}/edit`;
      const edit = form(await get(path), "post-editor");
      edit.body.set("title", `${fixture.prefix} 수정`);
      edit.body.set("body", "## 수정 본문");
      expect((await post(path, edit)).status).toBe(303);
      for (const intent of ["publish", "unpublish"] as const) {
        const changed = await post(path, form(await get(path), `post-${intent}`));
        expect(changed.status).toBe(303);
        const publicPage = await get(`/posts/${id}`);
        expect(document(publicPage).querySelector("article") !== null).toBe(intent === "publish");
        const filtered = await get(
          `/my-posts?status=${intent === "publish" ? "published" : "draft"}`,
        );
        expect(document(filtered).querySelector(`a[href="${prefix}${path}"]`)).toBeTruthy();
        expect(
          document(
            await get(`/my-posts?status=${intent === "publish" ? "draft" : "published"}`),
          ).querySelector(`a[href="${prefix}${path}"]`),
        ).toBeNull();
      }
      const confirm = document(await get(path)).querySelector(
        `a[href="${prefix}/my-posts/${id}/delete"]`,
      );
      expect(confirm).toBeTruthy();
      expect(
        (await fixture.client.GET("/posts/{id}", { params: { path: { id } } })).data,
      ).toBeTruthy();
      const deletePath = `/my-posts/${id}/delete`;
      const confirmation = await get(deletePath);
      expect(document(confirmation).body.textContent).toContain(
        locale === "ko" ? "되돌릴 수 없습니다." : "This cannot be undone.",
      );
      const deleted = await post(deletePath, form(confirmation, "post-delete"));
      expect(deleted.status).toBe(303);
      expect(deleted.headers.get("location")).toBe(`${prefix}/my-posts`);
      expect(
        document(await get("/my-posts")).querySelector(`a[href="${prefix}${path}"]`),
      ).toBeNull();
      expect(document(await get(path)).querySelector("#post-editor")).toBeNull();
    },
    30000,
  );
  it("비로그인한 내 글 요청은 로그인으로 이동한다", async () => {
    const response = await fetch(`${base}/my-posts/new`, {
      redirect: "manual",
      headers: { "Accept-Language": "ko" },
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/login?returnTo=");
  });
});
