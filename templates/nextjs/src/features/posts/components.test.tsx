import { ko, en } from "../../lib/i18n/catalogs";
// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import {
  PostDetail,
  PostList,
  PostSearchForm,
  PostPagination,
  PostsSkeleton,
  PostDetailSkeleton,
} from "./components";

afterEach(cleanup);
const post = {
  id: "example-id",
  title: "제목",
  body: "## 소제목\n\n**굵게**\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[나쁜 링크](javascript:alert(1))",
  authorName: "작성자",
  coverUrl: "https://example.com/cover.png",
  publishedAt: "2026-10-01T00:00:00Z",
};
function show(children: ReactNode, locale: "ko" | "en" = "ko") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ko" ? ko : en}
      timeZone="Asia/Seoul"
    >
      {children}
    </NextIntlClientProvider>,
  );
}
it.each(["ko", "en"] as const)(
  "%s 목록은 상세 링크·작성자·커버와 빈 목록을 보여 준다",
  (locale) => {
    const view = show(<PostList posts={[post]} />, locale);
    expect(screen.getByRole("link", { name: post.title }).getAttribute("href")).toBe(
      `${locale === "en" ? "/en" : ""}/posts/example-id`,
    );
    expect(screen.getByText("작성자")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toContain("cover.png");
    view.unmount();
    show(<PostList posts={[]} />, locale);
    expect(screen.getByText(locale === "ko" ? "글이 없습니다." : "No posts found.")).toBeTruthy();
  },
);
it("GET 폼은 검색·정렬을 유지하고 새 검색은 첫 페이지에서 시작한다", () => {
  show(<PostSearchForm q="검색" sort="title" size={1} />, "en");
  const input = screen.getByRole("searchbox", { name: "Search posts" }) as HTMLInputElement;
  expect(input.value).toBe("검색");
  expect(input.name).toBe("q");
  const form = input.closest("form")!;
  expect(form.method).toBe("get");
  expect(form.getAttribute("action")).toBe("/en/posts");
  expect((screen.getByRole("combobox", { name: "Sort" }) as HTMLSelectElement).value).toBe("title");
  expect(form.querySelector('[name="page"]')).toBeNull();
});
it("페이지 링크를 web URL로 옮겨 검색·정렬·크기를 유지한다", () => {
  show(
    <PostPagination
      links={{
        previous: null,
        next: "/api/v1/posts?filter%5Bq%5D=%EA%B2%80%EC%83%89&sort=title&page%5Bnumber%5D=2&page%5Bsize%5D=1",
      }}
    />,
    "en",
  );
  expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
  const next = new URL(
    screen.getByRole("link", { name: "Next" }).getAttribute("href")!,
    "https://example.com",
  );
  expect(next.pathname).toBe("/en/posts");
  expect(Object.fromEntries(next.searchParams)).toEqual({
    q: "검색",
    sort: "title",
    page: "2",
    size: "1",
  });
});
it("상세는 GFM을 렌더링하고 원시 HTML과 실행 가능한 링크를 버린다", () => {
  const { container } = show(<PostDetail post={post} />);
  expect(screen.getByRole("heading", { level: 1, name: "제목" })).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2, name: "소제목" })).toBeTruthy();
  expect(screen.getByRole("table")).toBeTruthy();
  expect(container.querySelector("strong")?.textContent).toBe("굵게");
  expect(container.querySelector("script, [onerror]")).toBeNull();
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(screen.getByRole("link", { name: "글 목록" })).toBeTruthy();
});
it("커버와 작성자가 없어도 상세를 읽을 수 있다", () => {
  show(<PostDetail post={{ ...post, authorName: null, coverUrl: null }} />);
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText("알 수 없는 작성자")).toBeTruthy();
});
it("목록과 상세 스켈레톤은 보이는 문구가 없다", () => {
  const { container } = show(
    <>
      <PostsSkeleton />
      <PostDetailSkeleton />
    </>,
  );
  expect(container.textContent).toBe("");
  expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(3);
});
