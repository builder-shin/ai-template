// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { ResourceSelect } from "./select";
import type { Option, SearchOptions } from "./types";
import ko from "../../../messages/ko.json";
import shared from "../../../messages/shared/ko.json";
import { intlFixture } from "../../../scripts/test/intl-fixture";

afterEach(cleanup);
const options = ["a", "b", "c", "d", "e"].map((value) => ({ value, label: value.toUpperCase() }));
function show(defaultValue: string[] = [], search: SearchOptions = async () => options) {
  render(
    <NextIntlClientProvider {...intlFixture({ ...shared, ...ko })}>
      <form aria-label="역할 폼">
        <ResourceSelect
          name="roles"
          label="역할"
          multiple
          options={options}
          defaultValue={defaultValue}
          search={search}
        />
      </form>
    </NextIntlClientProvider>,
  );
  return {
    trigger: screen.getByRole("combobox", { name: "역할" }),
    values: () =>
      new FormData(screen.getByRole("form", { name: "역할 폼" }) as HTMLFormElement).getAll(
        "roles",
      ),
  };
}
function rows() {
  return screen.getAllByRole("option");
}
function focusedOption() {
  const active = document.activeElement;
  return active?.getAttribute("role") === "option"
    ? active
    : document.getElementById(active?.getAttribute("aria-activedescendant") ?? "");
}

it("검색형 다중 선택의 중간 행은 포인터 선택과 같은 위치의 재클릭 뒤에도 움직이지 않는다", async () => {
  const user = userEvent.setup();
  const { trigger, values } = show();
  await user.click(trigger);
  await screen.findByRole("option", { name: "C" });
  const before = rows();
  await user.click(before[2]!);
  expect.soft(rows()).toEqual(before);
  expect.soft(values()).toEqual(["c"]);
  await user.click(rows()[2]!);
  expect.soft(rows()).toEqual(before);
  expect(values()).toEqual([]);
});

it("검색형 다중 선택의 해제는 인접 역할과 현재 포인터 행을 바꾸지 않는다", async () => {
  const user = userEvent.setup();
  const { trigger, values } = show(["a", "d"]);
  await user.click(trigger);
  await screen.findByRole("option", { name: "A" });
  const before = rows();
  await user.click(before[0]!);
  expect.soft(rows()).toEqual(before);
  expect.soft(values()).toEqual(["d"]);
  await user.click(rows()[0]!);
  expect.soft(rows()).toEqual(before);
  expect(values()).toEqual(["d", "a"]);
});

it("검색형 다중 선택의 키보드 Space는 같은 포커스 항목만 선택하고 해제한다", async () => {
  const user = userEvent.setup();
  const { trigger, values } = show();
  await user.click(trigger);
  const input = await screen.findByRole("combobox", { name: "대상 검색" });
  await user.click(input);
  await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
  const target = focusedOption();
  expect(target?.textContent).toContain("C");
  const before = rows();
  await user.keyboard(" ");
  expect.soft(rows()).toEqual(before);
  expect.soft(focusedOption()).toBe(target);
  expect.soft(values()).toEqual(["c"]);
  await user.keyboard(" ");
  expect.soft(rows()).toEqual(before);
  expect.soft(focusedOption()).toBe(target);
  expect(values()).toEqual([]);
  await user.type(input, "역할 이름");
  expect((input as HTMLInputElement).value).toBe("역할 이름");
  expect(values()).toEqual([]);
});

it.each([{ defaultValue: [] }, { defaultValue: ["a"] }])(
  "검색에서 고른 다중 관계는 다음 응답과 재열기 뒤에도 값·라벨·Enter 포커스를 유지한다: $defaultValue",
  async ({ defaultValue }) => {
    const user = userEvent.setup();
    const first = Promise.withResolvers<Option[]>();
    const second = Promise.withResolvers<Option[]>();
    const { trigger, values } = show(defaultValue, (term) =>
      term === "첫 검색" ? first.promise : second.promise,
    );
    await user.click(trigger);
    const input = await screen.findByRole("combobox", { name: "대상 검색" });
    await user.type(input, "첫 검색{Enter}");
    expect.soft(document.activeElement).toBe(input);
    await act(async () => first.resolve([{ value: "s", label: "첫 검색 역할" }]));
    await user.click(await screen.findByRole("option", { name: "첫 검색 역할" }));
    const selected = [...defaultValue, "s"];
    expect.soft(values()).toEqual(selected);
    await user.clear(input);
    await user.type(input, "둘째 검색{Enter}");
    expect.soft(document.activeElement).toBe(input);
    await act(async () => second.resolve([{ value: "t", label: "둘째 검색 역할" }]));
    await screen.findByRole("option", { name: "둘째 검색 역할" });
    expect.soft(document.activeElement).toBe(input);
    expect.soft(values()).toEqual(selected);
    expect.soft(trigger.textContent).toContain("첫 검색 역할");
    if (defaultValue.length) expect.soft(trigger.textContent).toContain("A");
    const before = rows();
    const selectedRow = before.findIndex((option) => option.textContent?.includes("첫 검색 역할"));
    await user.click(before[selectedRow]!);
    expect.soft(rows()).toEqual(before);
    expect.soft(values()).toEqual(defaultValue);
    await user.click(rows()[selectedRow]!);
    expect.soft(rows()).toEqual(before);
    expect.soft(values()).toEqual(selected);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect.soft(values()).toEqual(selected);
    expect.soft(trigger.textContent).toContain("첫 검색 역할");
    await user.click(trigger);
    await screen.findByRole("option", { name: "첫 검색 역할" });
    expect(values()).toEqual(selected);
  },
);

it("같은 검색의 새 응답 뒤 Space는 현재 가상 포커스 역할만 선택한다", async () => {
  const user = userEvent.setup();
  const first = Promise.withResolvers<Option[]>();
  const second = Promise.withResolvers<Option[]>();
  let requests = 0;
  const { trigger, values } = show([], () => (++requests === 1 ? first.promise : second.promise));
  await user.click(trigger);
  const input = await screen.findByRole("combobox", { name: "대상 검색" });
  await user.type(input, "역할{Enter}");
  await act(async () => first.resolve([{ value: "s", label: "이전 검색 역할" }]));
  await screen.findByRole("option", { name: "이전 검색 역할" });
  await user.keyboard("{ArrowDown}");
  await user.click(screen.getByRole("button", { name: "검색" }));
  await user.click(input);
  expect.soft(document.activeElement).toBe(input);
  await act(async () => second.resolve([{ value: "t", label: "새 검색 역할" }]));
  const current = await screen.findByRole("option", { name: "새 검색 역할" });
  expect.soft(document.activeElement).toBe(input);
  expect.soft(focusedOption()).toBe(current);
  await user.keyboard(" ");
  expect.soft(focusedOption()).toBe(current);
  expect(values()).toEqual(["t"]);
});

it.each([false, true])(
  "단일 선택의 현재값 순서와 필터 빈 항목을 유지한다 (검색: %s)",
  async (searchable) => {
    const user = userEvent.setup();
    function field(current: readonly Option[]) {
      return (
        <NextIntlClientProvider {...intlFixture({ ...shared, ...ko })}>
          <ResourceSelect
            name="author"
            label="작성자"
            options={current}
            defaultValue="a"
            allowEmpty
            {...(searchable ? { search: async () => [] } : {})}
          />
        </NextIntlClientProvider>
      );
    }
    const view = render(field(options));
    view.rerender(field([{ value: "b", label: "B" }]));
    await user.click(screen.getByRole("combobox", { name: "작성자" }));
    await screen.findByRole("option", { name: "전체" });
    expect(rows().map((option) => option.textContent)).toEqual(
      searchable ? ["전체", "A", "B"] : ["전체", "B", "A"],
    );
  },
);

const compositionKeys = [
  { name: "isComposing", isComposing: true, keyCode: 13, which: 13 },
  { name: "keyCode229", isComposing: false, keyCode: 229, which: 229 },
];

it.each(compositionKeys)(
  "조합 중 Enter는 검색하지 않고 조합 종료 뒤 Enter가 최종 검색어를 보낸다: $name",
  async ({ name: _name, ...key }) => {
    const user = userEvent.setup();
    const result = Promise.withResolvers<Option[]>();
    const search = vi.fn((_term: string) => result.promise);
    const { trigger, values } = show(["a"], search);
    await user.click(trigger);
    const input = await screen.findByRole("combobox", { name: "대상 검색" });
    await user.type(input, "관리");
    fireEvent.compositionStart(input, { data: "ㅈ" });
    fireEvent.change(input, { target: { value: "관리자" } });
    expect((input as HTMLInputElement).value).toBe("관리자");
    const commit = createEvent.keyDown(input, { key: "Enter", code: "Enter", ...key });
    fireEvent(input, commit);
    expect.soft(commit.defaultPrevented).toBe(false);
    expect.soft(search.mock.calls).toEqual([]);
    expect.soft(document.activeElement).toBe(input);
    expect.soft(values()).toEqual(["a"]);
    fireEvent.compositionEnd(input, { data: "자" });
    expect.soft(search.mock.calls).toEqual([]);
    await user.keyboard("{Enter}");
    expect.soft(search.mock.calls).toEqual([["관리자"]]);
    expect.soft(document.activeElement).toBe(input);
    await act(async () => result.resolve([{ value: "s", label: "관리자 역할" }]));
    const role = await screen.findByRole("option", { name: "관리자 역할" });
    expect.soft(document.activeElement).toBe(input);
    expect.soft(values()).toEqual(["a"]);
    await user.click(role);
    expect(values()).toEqual(["a", "s"]);
  },
);

it.each(
  compositionKeys.map((key) =>
    key.name === "isComposing" ? { ...key, keyCode: 32, which: 32 } : key,
  ),
)(
  "조합 중 Space는 현재 키보드 대상과 제출값을 유지한다: $name",
  async ({ name: _name, ...key }) => {
    const user = userEvent.setup();
    const search = vi.fn(async () => options);
    const { trigger, values } = show(["a"], search);
    await user.click(trigger);
    const input = await screen.findByRole("combobox", { name: "대상 검색" });
    await user.type(input, "관리");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    const target = focusedOption();
    expect(target?.textContent).toContain("C");
    const before = rows();
    fireEvent.compositionStart(input);
    const space = createEvent.keyDown(input, { key: " ", code: "Space", ...key });
    fireEvent(input, space);
    expect.soft(space.defaultPrevented).toBe(false);
    expect.soft(values()).toEqual(["a"]);
    expect.soft(rows()).toEqual(before);
    expect.soft(focusedOption()).toBe(target);
    expect.soft(document.activeElement).toBe(input);
    expect.soft(search.mock.calls).toEqual([]);
    fireEvent.compositionEnd(input, { target: { value: "" } });
    const current = screen.getByRole("option", { name: "A" });
    await waitFor(() => expect(focusedOption()).toBe(current));
    await user.keyboard(" ");
    expect.soft(focusedOption()).toBe(current);
    expect(values()).toEqual([]);
  },
);

it("검색 입력의 combobox는 Enter로 강조한 역할을 선택하고 해제한다", async () => {
  const user = userEvent.setup();
  const search = vi.fn(async () => options);
  const { trigger, values } = show([], search);
  await user.click(trigger);
  const input = await screen.findByRole("combobox", { name: "대상 검색" });
  await user.click(input);
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  expect(values()).toEqual(["b"]);
  expect(search).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(input);
  await user.keyboard("{Enter}");
  expect(values()).toEqual([]);
  expect(search).not.toHaveBeenCalled();
});

it.each(["resolve", "reject"] as const)(
  "새 검색은 기다리는 검색보다 먼저 결과를 표시하고 늦은 %s를 버린다",
  async (settle) => {
    const user = userEvent.setup();
    const first = Promise.withResolvers<Option[]>();
    const second = Promise.withResolvers<Option[]>();
    const search = vi.fn((term: string) => (term === "첫 검색" ? first.promise : second.promise));
    const { trigger } = show([], search);
    await user.click(trigger);
    const input = await screen.findByRole("combobox", { name: "대상 검색" });
    await user.type(input, "첫 검색{Enter}");
    await user.clear(input);
    await user.type(input, "최신 검색{Enter}");
    expect(search.mock.calls).toEqual([["첫 검색"], ["최신 검색"]]);
    await act(async () => second.resolve([{ value: "new", label: "최신 결과" }]));
    await screen.findByRole("option", { name: "최신 결과" });
    await act(async () =>
      settle === "resolve"
        ? first.resolve([{ value: "old", label: "오래된 결과" }])
        : first.reject(new Error("오래된 실패")),
    );
    expect(screen.queryByRole("option", { name: "오래된 결과" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("option", { name: "최신 결과" })).toBeTruthy();
  },
);
