import { ko, en } from "../../lib/i18n/catalogs";
// @vitest-environment jsdom
import { act, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { FileUpload } from "./upload";
import { createFileAction, readyFileAction } from "./actions";

vi.mock("./actions", () => ({ createFileAction: vi.fn(), readyFileAction: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
function show(locale: "ko" | "en" = "ko") {
  function Form() {
    const [value, onChange] = useState({ id: "old-id", url: "https://storage.example/old" });
    const [pending, setPending] = useState(false);
    return (
      <form>
        <FileUpload
          name="coverImage"
          label={locale === "ko" ? "커버 이미지" : "Cover image"}
          value={value}
          onChange={onChange}
          returnTo="/my-posts/new"
          onPendingChange={setPending}
        />
        <button type="submit" disabled={pending}>
          저장
        </button>
      </form>
    );
  }
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ko" ? ko : en}
      timeZone="Asia/Seoul"
    >
      <Form />
    </NextIntlClientProvider>,
  );
}
it.each(["ko", "en"] as const)("%s의 JS 안내·현재 파일 값과 해제", async (locale) => {
  show(locale);
  expect(
    screen.getByText(
      locale === "ko"
        ? "파일 업로드에는 JavaScript가 필요합니다."
        : "File uploads require JavaScript.",
    ),
  ).toBeTruthy();
  expect(document.querySelector<HTMLInputElement>('input[name="coverImage"]')?.value).toBe(
    "old-id",
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: locale === "ko" ? "이미지 해제" : "Clear image" }));
  expect(document.querySelector<HTMLInputElement>('input[name="coverImage"]')?.value).toBe("");
  expect(screen.queryByRole("img")).toBeNull();
});
it("PUT과 ready 완료 전에는 기존 값을 유지하고 스피너와 비활성 입력을 표시한다", async () => {
  show();
  let finish!: (response: Response) => void;
  let request: RequestInit | undefined;
  const order: string[] = [];
  vi.mocked(createFileAction).mockImplementation(async () => {
    order.push("create");
    return {
      ok: true,
      id: "new-id",
      upload: {
        url: "https://storage.example/new",
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        expiresAt: "2026-10-01T00:00:00Z",
      },
    };
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (_url, init) =>
      new Promise((resolve) => {
        order.push("PUT");
        request = init;
        finish = resolve;
      }),
  );
  vi.mocked(readyFileAction).mockImplementation(async () => {
    order.push("ready");
    return {
      ok: true,
      file: { id: "new-id", url: "https://storage.example/ready" },
    };
  });
  const file = new File([new Uint8Array([137, 80, 78, 71])], "cover.png", { type: "image/png" });
  await userEvent.setup().upload(screen.getByLabelText("커버 이미지"), file);
  expect(screen.getByRole("status", { name: "진행 중" })).toBeTruthy();
  expect((screen.getByLabelText("커버 이미지") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);
  expect(request).toMatchObject({
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: file,
    credentials: "omit",
  });
  expect(document.querySelector<HTMLInputElement>('input[name="coverImage"]')?.value).toBe(
    "old-id",
  );
  await act(async () => finish(new Response(null, { status: 200 })));
  expect(document.querySelector<HTMLInputElement>('input[name="coverImage"]')?.value).toBe(
    "new-id",
  );
  expect(screen.getByRole("img").getAttribute("src")).toBe("https://storage.example/ready");
  expect(screen.queryByRole("status")).toBeNull();
  expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(false);
  expect(order).toEqual(["create", "PUT", "ready"]);
});
it("생성 검증 실패는 기존 값을 유지하고 입력칸 오류를 표시한다", async () => {
  show("en");
  const put = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
  vi.mocked(createFileAction).mockResolvedValue({
    ok: false,
    formError: null,
    fieldErrors: { size: ["Too large"] },
  });
  await userEvent
    .setup()
    .upload(screen.getByLabelText("Cover image"), new File(["x"], "x.png", { type: "image/png" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Too large");
  expect(document.querySelector<HTMLInputElement>('input[name="coverImage"]')?.value).toBe(
    "old-id",
  );
  expect(put).not.toHaveBeenCalled();
  expect(readyFileAction).not.toHaveBeenCalled();
});
it.each(["put", "network", "ready"])(
  "%s 실패는 현재 값을 유지하고 재시도를 허용한다",
  async (stage) => {
    show();
    vi.mocked(createFileAction).mockResolvedValue({
      ok: true,
      id: "new-id",
      upload: {
        url: "https://storage.example/new",
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        expiresAt: "2026-10-01T00:00:00Z",
      },
    });
    const fetcher = vi.spyOn(globalThis, "fetch");
    if (stage === "network") fetcher.mockRejectedValue(new Error("offline"));
    else fetcher.mockResolvedValue(new Response(null, { status: stage === "put" ? 403 : 200 }));
    vi.mocked(readyFileAction).mockResolvedValue({
      ok: false,
      formError: "파일 업로드를 완료하세요.",
      fieldErrors: {},
    });
    await userEvent
      .setup()
      .upload(
        screen.getByLabelText("커버 이미지"),
        new File(["x"], "x.png", { type: "image/png" }),
      );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      stage === "ready"
        ? "파일 업로드를 완료하세요."
        : "파일을 올리지 못했습니다. 다시 시도하세요.",
    );
    expect(document.querySelector<HTMLInputElement>('input[name="coverImage"]')?.value).toBe(
      "old-id",
    );
    await waitFor(() =>
      expect((screen.getByLabelText("커버 이미지") as HTMLInputElement).disabled).toBe(false),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    if (stage === "ready") expect(readyFileAction).toHaveBeenCalledTimes(1);
    else expect(readyFileAction).not.toHaveBeenCalled();
  },
);
it.each([
  ["ko", "create"],
  ["en", "create"],
  ["ko", "ready"],
  ["en", "ready"],
] as const)("%s의 %s 한도 오류는 대기 시간을 안내한다", async (locale, stage) => {
  show(locale);
  const failure = {
    ok: false as const,
    formError:
      locale === "ko"
        ? "요청이 너무 많습니다. 잠시 뒤에 다시 시도하세요."
        : "Too many requests. Try again later.",
    fieldErrors: {},
    retryAfter: 12,
  };
  vi.mocked(createFileAction).mockResolvedValue(
    stage === "create"
      ? failure
      : {
          ok: true,
          id: "new-id",
          upload: {
            url: "https://storage.example/new",
            method: "PUT",
            headers: { "Content-Type": "image/png" },
            expiresAt: "2026-10-01T00:00:00Z",
          },
        },
  );
  vi.mocked(readyFileAction).mockResolvedValue(failure);
  const put = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
  const label = locale === "ko" ? "커버 이미지" : "Cover image";
  await userEvent
    .setup()
    .upload(screen.getByLabelText(label), new File(["x"], "x.png", { type: "image/png" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    `${failure.formError}\n${locale === "ko" ? "12초 뒤에 다시 시도해 주세요." : "Try again in 12 seconds."}`,
  );
  expect(document.querySelector<HTMLInputElement>('input[name="coverImage"]')?.value).toBe(
    "old-id",
  );
  await waitFor(() =>
    expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(false),
  );
  expect(put).toHaveBeenCalledTimes(stage === "create" ? 0 : 1);
  expect(readyFileAction).toHaveBeenCalledTimes(stage === "create" ? 0 : 1);
  // 다시 올리면 대기 안내를 지우고 같은 파일도 선택할 수 있다.
  vi.mocked(createFileAction).mockResolvedValue({
    ok: true,
    id: "new-id",
    upload: {
      url: "https://storage.example/new",
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      expiresAt: "2026-10-01T00:00:00Z",
    },
  });
  vi.mocked(readyFileAction).mockResolvedValue({
    ok: true,
    file: { id: "new-id", url: "https://storage.example/ready" },
  });
  await userEvent
    .setup()
    .upload(screen.getByLabelText(label), new File(["x"], "x.png", { type: "image/png" }));
  await waitFor(() =>
    expect(document.querySelector<HTMLInputElement>('input[name="coverImage"]')?.value).toBe(
      "new-id",
    ),
  );
  expect(screen.queryByRole("alert")).toBeNull();
});
