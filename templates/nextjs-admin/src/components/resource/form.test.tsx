// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { ResourceForm, ResourceInput, useResourceField } from "./form";
import ko from "../../../messages/ko.json";
import shared from "../../../messages/shared/ko.json";
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
      action={async () => ({ ok: false, formError: null, fieldErrors: { title: ["오류"] } })}
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
  await user.click(screen.getByRole("combobox", { name: "역할" }));
  await user.click(await screen.findByRole("option", { name: "B" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "저장" }));
  expect(submitted?.getAll("roles")).toEqual(["a", "b"]);
  expect(submitted?.get("enabled")).toBe("true");
  expect(submitted?.get("body")).toBe("본문 값");
});
