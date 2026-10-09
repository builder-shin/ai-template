// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { ResourceForm, ResourceInput, useResourceField } from "./form";
import ko from "../../../messages/ko.json";
import shared from "../../../messages/shared/ko.json";
import en from "../../../messages/en.json";
import sharedEn from "../../../messages/shared/en.json";
import { intlFixture } from "../../../scripts/test/intl-fixture";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("../../lib/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
  useRouter: () => navigation,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function translated(node: React.ReactNode) {
  return (
    <NextIntlClientProvider {...intlFixture({ ...shared, ...ko })}>{node}</NextIntlClientProvider>
  );
}
function show(node: React.ReactNode) {
  return render(translated(node));
}
it("폼은 실제 제출 뒤 필드 오류·배너를 표시하고 입력을 보존한다", async () => {
  const user = userEvent.setup();
  async function action(_state: unknown, data: FormData) {
    expect(data.get("title")).toBe("유지할 제목");
    return {
      ok: false as const,
      fieldErrors: { title: ["제목을 확인하세요."] },
      formError: "요청을 확인하세요.",
    };
  }
  show(
    <ResourceForm title="수정" action={action} permalink="/posts/1/edit" cancelHref="/posts/1">
      <ResourceInput name="title" label="제목" kind="text" />
    </ResourceForm>,
  );
  await user.type(screen.getByRole("textbox", { name: "제목" }), "유지할 제목");
  await user.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByText("제목을 확인하세요.")).toBeDefined();
  expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByRole("alert").textContent).toBe("요청을 확인하세요.");
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("유지할 제목");
});
it("입력 override는 같은 필드 오류 상태와 폼 이름을 쓴다", async () => {
  function Custom() {
    const { invalid, describedBy } = useResourceField("title");
    return (
      <input
        id="title"
        name="title"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        defaultValue="바꾼 입력"
      />
    );
  }
  show(
    <ResourceForm
      title="생성"
      action={async (_state, data) => {
        expect(data.get("title")).toBe("바꾼 입력");
        return { ok: false, formError: null, fieldErrors: { title: ["오류"] } };
      }}
      permalink="/posts/new"
      cancelHref="/posts"
    >
      <ResourceInput name="title" label="제목" kind="text">
        <Custom />
      </ResourceInput>
    </ResourceForm>,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByText("오류")).toBeDefined();
  expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe("true");
});
it("체크박스·여러 줄·열거값·다중 관계 입력이 폼으로 제출된다", async () => {
  const user = userEvent.setup();
  let submitted: FormData | undefined;
  show(
    <ResourceForm
      title="수정"
      action={async (_state, data) => {
        submitted = data;
        return { ok: true };
      }}
      permalink="/roles/1/edit"
      cancelHref="/roles/1"
    >
      <ResourceInput name="enabled" label="활성" kind="boolean" defaultValue={true} />
      <ResourceInput name="body" label="본문" kind="textarea" defaultValue="본문 값" />
      <ResourceInput
        name="status"
        label="상태"
        kind="enum"
        defaultValue="draft"
        options={[
          { value: "draft", label: "초안" },
          { value: "published", label: "발행" },
        ]}
      />
      <ResourceInput
        name="roles"
        label="역할"
        kind="relation-many"
        defaultValue={["a"]}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
      />
    </ResourceForm>,
  );
  await user.click(screen.getByRole("combobox", { name: "상태" }));
  await user.click(await screen.findByRole("option", { name: "발행" }));
  await user.click(screen.getByRole("combobox", { name: "역할" }));
  await user.click(await screen.findByRole("option", { name: "B" }));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  await user.click(screen.getByRole("button", { name: "저장" }));
  expect(submitted?.getAll("roles")).toEqual(["a", "b"]);
  expect(submitted?.get("enabled")).toBe("true");
  expect(submitted?.get("body")).toBe("본문 값");
  expect(submitted?.get("status")).toBe("published");
});

function relationForm(multiple: boolean, defaultValue?: string | string[]) {
  return (
    <ResourceForm
      title="수정"
      action={async () => ({ ok: true })}
      permalink="/users/u/edit"
      cancelHref="/users/u"
    >
      <ResourceInput
        name="roles"
        label="역할"
        kind={multiple ? "relation-many" : "relation"}
        defaultValue={defaultValue}
        options={[{ value: "a", label: "기존 역할" }]}
        search={async () => [{ value: "s", label: "검색 역할" }]}
      />
    </ResourceForm>
  );
}

it("다중 열거값 입력은 여러 값과 빈 선택의 존재 표식을 제출한다", async () => {
  const user = userEvent.setup();
  let submitted: FormData | undefined;
  show(
    <ResourceForm
      title="수정"
      action={async (_state, data) => {
        submitted = data;
        return { ok: true };
      }}
      permalink="/roles/r/edit"
      cancelHref="/roles/r"
    >
      <ResourceInput
        name="permissions"
        label="권한"
        kind="enum-many"
        defaultValue={["posts:create"]}
        options={[
          { value: "posts:create", label: "글 작성" },
          { value: "posts:manage", label: "글 관리" },
        ]}
      />
    </ResourceForm>,
  );
  const trigger = screen.getByRole("combobox", { name: "권한" });
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: "글 관리" }));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  await user.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() =>
    expect(submitted?.getAll("permissions")).toEqual(["posts:create", "posts:manage"]),
  );
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: "글 작성" }));
  await user.click(await screen.findByRole("option", { name: "글 관리" }));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  await user.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(submitted?.getAll("permissions")).toEqual([]));
  expect(submitted?.get("__present_permissions")).toBe("1");
});

it("다중 관계의 검색 선택은 팝업을 닫아도 값과 라벨을 유지한다", async () => {
  const user = userEvent.setup();
  show(relationForm(true));
  const trigger = screen.getByRole("combobox", { name: "역할" });
  const form = trigger.closest("form")!;
  await user.click(trigger);
  await user.type(await screen.findByRole("textbox", { name: "대상 검색" }), "역할 이름");
  await user.click(screen.getByRole("button", { name: "검색" }));
  await user.click(await screen.findByRole("option", { name: "검색 역할" }));
  expect(new FormData(form).getAll("roles")).toEqual(["s"]);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect.soft(new FormData(form).getAll("roles")).toEqual(["s"]);
  expect.soft(trigger.textContent).toContain("검색 역할");
});

it.each([false, true])(
  "관계 검색 결과에 없는 기존 선택을 보존한다 (다중 선택: %s)",
  async (multiple) => {
    const user = userEvent.setup();
    show(relationForm(multiple, multiple ? ["a"] : "a"));
    const trigger = screen.getByRole("combobox", { name: "역할" });
    const form = trigger.closest("form")!;
    await user.click(trigger);
    await user.type(await screen.findByRole("textbox", { name: "대상 검색" }), "다른 역할");
    await user.click(screen.getByRole("button", { name: "검색" }));
    expect(await screen.findByRole("option", { name: "검색 역할" })).toBeDefined();
    expect.soft(new FormData(form).getAll("roles")).toEqual(["a"]);
    expect.soft(trigger.textContent).toContain("기존 역할");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(new FormData(form).getAll("roles")).toEqual(["a"]);
  },
);
it.each([
  { locale: "ko", label: "선택 안 함" },
  { locale: "en", label: "None" },
] as const)("단일 관계 폼의 빈 옵션은 빈 문자열로 제출된다: $locale", async ({ locale, label }) => {
  const user = userEvent.setup();
  render(
    <NextIntlClientProvider
      {...intlFixture(locale === "en" ? { ...sharedEn, ...en } : { ...shared, ...ko }, locale)}
    >
      {relationForm(false, "a")}
    </NextIntlClientProvider>,
  );
  const trigger = screen.getByRole("combobox", { name: "역할" });
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: label }));
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect(new FormData(trigger.closest("form")!).get("roles")).toBe("");
  expect(screen.queryByText("전체")).toBeNull();
});
