// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../../messages/ko.json";
import en from "../../../messages/en.json";
import { PostsRealtime, PostRealtime } from "./realtime";
import { useChannel } from "../../lib/realtime";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh }),
}));
vi.mock("../../lib/realtime", () => ({ useChannel: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
function event(
  name: "post.deleted" | "post.unpublished" | "post.updated" | "post.published",
  id = "current-post",
  status: "draft" | "published" = "published",
) {
  const handler = vi.mocked(useChannel).mock.calls.at(-1)![1];
  // 이 검사는 같은 글과 공개 상태만 사용한다.
  act(() =>
    handler({
      name,
      payload: { data: { type: "posts", id, attributes: { status } } },
    } as Parameters<typeof handler>[0]),
  );
}
it("공개 목록은 짧은 시간의 글 변경을 한 번으로 모으고 해제 때 타이머를 지운다", () => {
  vi.useFakeTimers();
  const view = render(<PostsRealtime />);
  expect(useChannel).toHaveBeenCalledWith("posts", expect.any(Function)); // gen:feature: 그대로
  event("post.updated");
  event("post.deleted");
  event("post.unpublished");
  expect(refresh).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(100));
  expect(refresh).toHaveBeenCalledTimes(1);
  event("post.updated");
  view.unmount();
  act(() => vi.advanceTimersByTime(100));
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("작성자 방의 draft 수정은 발행 취소 안내를 보존하고 재발행만 안내를 지운다", () => {
  vi.useFakeTimers();
  const wrap = (body: string) => (
    <NextIntlClientProvider locale="ko" messages={ko}>
      <PostRealtime id="current-post">
        <p>{body}</p>
      </PostRealtime>
    </NextIntlClientProvider>
  );
  const view = render(wrap("공개 본문"));
  event("post.unpublished", "current-post", "draft");
  act(() => vi.advanceTimersByTime(100));
  view.rerender(wrap("서버의 404"));
  event("post.updated", "current-post", "draft");
  act(() => vi.advanceTimersByTime(100));
  expect(screen.getByRole("alert").textContent).toBe(ko.posts.unpublishedNotice);
  expect(screen.queryByText("서버의 404")).toBeNull();
  expect(refresh).toHaveBeenCalledTimes(2);
  event("post.published", "current-post", "published");
  act(() => vi.advanceTimersByTime(100));
  view.rerender(wrap("재발행 본문"));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("재발행 본문")).toBeTruthy();
  expect(refresh).toHaveBeenCalledTimes(3);
});
it.each(["ko", "en"] as const)(
  "%s 상세는 같은 글만 갱신하고 삭제·발행 취소 안내를 보존한다",
  (locale) => {
    vi.useFakeTimers();
    const wrap = (child: string) => (
      <NextIntlClientProvider locale={locale} messages={locale === "ko" ? ko : en}>
        <PostRealtime id="current-post">
          <p>{child}</p>
        </PostRealtime>
      </NextIntlClientProvider>
    );
    const view = render(wrap("본문"));
    event("post.deleted", "other-post");
    act(() => vi.advanceTimersByTime(100));
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    event("post.updated");
    act(() => vi.advanceTimersByTime(100));
    expect(refresh).toHaveBeenCalledTimes(1);
    event("post.unpublished");
    expect(screen.getByRole("alert").textContent).toBe(
      locale === "ko" ? "이 글의 발행이 취소되었습니다." : "This post is no longer published.",
    );
    expect(screen.queryByText("본문")).toBeNull();
    view.rerender(wrap("서버의 404"));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("서버의 404")).toBeNull();
    event("post.deleted");
    expect(screen.getByRole("alert").textContent).toBe(
      locale === "ko" ? "이 글이 삭제되었습니다." : "This post was deleted.",
    );
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      `${locale === "en" ? "/en" : ""}/posts`,
    );
    act(() => vi.advanceTimersByTime(100));
    expect(refresh).toHaveBeenCalledTimes(2);
  },
);
