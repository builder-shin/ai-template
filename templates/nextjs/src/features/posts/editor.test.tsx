// @vitest-environment jsdom
import { act } from "react";
import type { ReactNode } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../../messages/ko.json";
import en from "../../../messages/en.json";
import { PostEditor, PostMutationForm } from "./editor";
import type { PostResult } from "./state";

afterEach(cleanup);
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
it("현재 커버 id를 폼에 넣고 해제하면 빈 값을 제출한다", async () => {
  let received: FormData | undefined;
  show(
    <PostEditor
      action={async (_state, data) => {
        received = data;
        return { ok: true };
      }}
      permalink="/my-posts/id/edit"
      values={{ title: "제목", body: "본문", coverImage: "cover-id" }}
      coverUrl="https://storage.example/cover"
    />,
  );
  expect(document.querySelector<HTMLInputElement>('input[name="coverImage"]')?.value).toBe(
    "cover-id",
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "이미지 해제" }));
  await userEvent.setup().click(screen.getByRole("button", { name: "저장" }));
  expect(received?.get("coverImage")).toBe("");
});
it.each(["ko", "en"] as const)(
  "%s 편집기 이름·길이·초기 값과 Markdown 미리보기",
  async (locale) => {
    show(
      <PostEditor
        action={async () => ({ ok: true })}
        permalink="/my-posts/new"
        values={{
          title: "초안",
          body: "## 소제목\n\n**굵게**\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[위험](javascript:alert(1))",
        }}
      />,
      locale,
    );
    const title = screen.getByLabelText(locale === "ko" ? "제목" : "Title") as HTMLInputElement;
    const body = screen.getByLabelText(locale === "ko" ? "본문" : "Body") as HTMLTextAreaElement;
    expect([title.name, title.maxLength, title.required, title.value]).toEqual([
      "title",
      200,
      true,
      "초안",
    ]);
    expect([body.name, body.maxLength]).toEqual(["body", 100000]);
    await userEvent
      .setup()
      .click(screen.getByRole("tab", { name: locale === "ko" ? "미리보기" : "Preview" }));
    expect(screen.getByRole("heading", { name: "소제목" })).toBeTruthy();
    expect(document.querySelector("strong")?.textContent).toBe("굵게");
    expect(document.querySelector("script, img, a[href^='javascript:']")).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("tab", { name: locale === "ko" ? "작성" : "Write" }));
    expect(
      (screen.getByLabelText(locale === "ko" ? "본문" : "Body") as HTMLTextAreaElement).value,
    ).toContain("**굵게**");
  },
);
it("Action의 입력칸 오류와 폼 오류를 표시하며 수정 값을 유지한다", async () => {
  let received: FormData | undefined;
  show(
    <PostEditor
      action={async (_state, data) => {
        received = data;
        return {
          ok: false,
          formError: "다시 확인",
          fieldErrors: { title: ["제목 오류"] },
          values: { title: String(data.get("title")), body: String(data.get("body")) },
        };
      }}
      permalink="/my-posts/new"
    />,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("제목"), "입력 제목");
  await user.type(screen.getByLabelText("본문"), "입력 본문");
  await user.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "다시 확인");
  expect(screen.getByLabelText("제목").getAttribute("aria-invalid")).toBe("true");
  expect(
    document.getElementById(screen.getByLabelText("제목").getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("제목 오류");
  expect(received?.get("body")).toBe("입력 본문");
  expect((screen.getByLabelText("본문") as HTMLTextAreaElement).value).toBe("입력 본문");
});
it("제출 중 스피너만 추가하고 버튼을 막는다", async () => {
  let finish!: (result: PostResult) => void;
  show(
    <PostEditor
      action={async () =>
        new Promise((resolve) => {
          finish = resolve;
        })
      }
      permalink="/my-posts/new"
      values={{ title: "제목", body: "본문" }}
    />,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "저장" }));
  expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("status", { name: "진행 중" })).toBeTruthy();
  await act(async () => finish({ ok: true }));
});
it("상태 전이 오류는 재조회 안내를 함께 표시한다", async () => {
  show(
    <PostMutationForm
      intent="publish"
      action={async () => ({
        ok: false,
        formError: "이 글 상태로 변경할 수 없습니다.",
        fieldErrors: {},
        invalidTransition: true,
      })}
      permalink="/my-posts/id/edit"
    />,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "발행" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "이 글 상태로 변경할 수 없습니다.",
  );
  expect(screen.getByText("새로고침으로 현재 상태를 확인한 뒤 다시 시도하세요.")).toBeTruthy();
});
it("삭제 확인 폼은 제목·취소 링크와 삭제 버튼을 표시한다", () => {
  show(
    <PostMutationForm
      intent="delete"
      title="지울 글"
      action={async () => ({ ok: true })}
      permalink="/en/my-posts/id/delete"
      cancelHref="/my-posts/id/edit"
    />,
    "en",
  );
  expect(screen.getByText("Delete “지울 글”? This cannot be undone.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe(
    "/en/my-posts/id/edit",
  );
  expect(screen.getByRole("button", { name: "Delete post" })).toBeTruthy();
});

it("요청 한도 오류는 Retry-After 초를 함께 안내한다", async () => {
  show(
    <PostMutationForm
      intent="publish"
      action={async () => ({
        ok: false,
        formError: "요청이 많습니다",
        fieldErrors: {},
        retryAfter: 12,
      })}
      permalink="/my-posts/id/edit"
    />,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "발행" }));
  expect(await screen.findByText("12초 뒤에 다시 시도해 주세요.")).toBeTruthy();
});
