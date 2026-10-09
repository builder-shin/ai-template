// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../../messages/ko.json";
import shared from "../../../messages/shared/ko.json";
import { intlFixture } from "../../../scripts/test/intl-fixture";
import { ResourceFilters } from "./filters";
import type { Query } from "./url";
import type { Option, SearchOptions } from "./types";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
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
function relationBar(options: readonly Option[], search: SearchOptions, query: Query = {}) {
  return (
    <ResourceFilters
      type="posts"
      query={query}
      filters={[{ name: "filter[author]", label: "작성자", kind: "relation", options, search }]}
    />
  );
}

it("필터 적용은 URL의 정렬을 보존하고 페이지를 1로 돌린다", async () => {
  const user = userEvent.setup();
  show(
    <ResourceFilters
      type="posts"
      query={{ sort: "-title", "page[number]": "3" }}
      filters={[
        { name: "filter[q]", label: "검색", kind: "text" },
        {
          name: "filter[status]",
          label: "상태",
          kind: "enum",
          options: [
            { value: "draft", label: "초안" },
            { value: "published", label: "발행" },
          ],
        },
        { name: "filter[createdFrom]", label: "시작", kind: "date" },
        { name: "filter[createdTo]", label: "끝", kind: "date" },
      ]}
      sort={[{ value: "title", label: "제목" }]}
    />,
  );
  await user.type(screen.getByRole("searchbox", { name: "검색" }), "테스트");
  await user.click(screen.getByRole("combobox", { name: "상태" }));
  await user.click(await screen.findByRole("option", { name: "초안" }));
  await user.click(screen.getByRole("button", { name: "적용" }));
  const url = new URL(navigation.push.mock.calls[0]![0], "http://localhost");
  expect(url.searchParams.get("filter[q]")).toBe("테스트");
  expect(url.searchParams.get("filter[status]")).toBe("draft");
  expect(url.searchParams.get("page[number]")).toBe("1");
  expect(url.searchParams.get("sort")).toBe("-title");
  expect(url.searchParams.get("page[size]")).toBe("20");
});

it("쿼리 이동과 초기화는 필터 값을 바꾸고 이전 조건을 다시 적용하지 않는다", async () => {
  const user = userEvent.setup();
  const bar = (query: Query) => (
    <ResourceFilters
      type="posts"
      query={query}
      filters={[
        { name: "filter[q]", label: "검색", kind: "text" },
        { name: "filter[createdFrom]", label: "시작", kind: "date" },
        {
          name: "filter[status]",
          label: "상태",
          kind: "enum",
          options: [
            { value: "draft", label: "초안" },
            { value: "published", label: "발행" },
          ],
        },
      ]}
      sort={[{ value: "title", label: "제목" }]}
    />
  );
  const normalized = { sort: "title", "page[number]": "1", "page[size]": "20" };
  const result = show(
    bar({
      ...normalized,
      "filter[q]": "이전 검색",
      "filter[status]": "draft",
      "filter[createdFrom]": "2026-10-08",
    }),
  );
  expect(screen.getByRole("combobox", { name: "상태" }).textContent).toContain("초안");
  await user.type(screen.getByRole("searchbox", { name: "검색" }), " 추가");
  fireEvent.change(screen.getByLabelText("시작"), { target: { value: "2026-10-09" } });
  result.rerender(
    translated(
      bar({
        ...normalized,
        sort: "-title",
        "filter[q]": "새 검색",
        "filter[status]": "published",
        "filter[createdFrom]": "2026-10-10",
      }),
    ),
  );
  expect
    .soft((screen.getByRole("searchbox", { name: "검색" }) as HTMLInputElement).value)
    .toBe("새 검색");
  expect.soft((screen.getByLabelText("시작") as HTMLInputElement).value).toBe("2026-10-10");
  expect.soft(screen.getByRole("combobox", { name: "상태" }).textContent).toContain("발행");
  expect
    .soft(screen.getByRole("combobox", { name: "정렬" }).textContent)
    .toContain("제목 내림차순");
  result.rerender(translated(bar(normalized)));
  expect.soft((screen.getByRole("searchbox", { name: "검색" }) as HTMLInputElement).value).toBe("");
  expect.soft((screen.getByLabelText("시작") as HTMLInputElement).value).toBe("");
  expect.soft(screen.getByRole("combobox", { name: "상태" }).textContent).toContain("선택하세요");
  await user.click(screen.getByRole("combobox", { name: "정렬" }));
  await user.click(await screen.findByRole("option", { name: "제목 내림차순" }));
  await user.click(screen.getByRole("button", { name: "적용" }));
  const url = new URL(navigation.push.mock.calls[0]![0], "http://localhost");
  for (const name of ["filter[q]", "filter[status]", "filter[createdFrom]"])
    expect.soft(url.searchParams.has(name)).toBe(false);
  expect(url.searchParams.get("sort")).toBe("-title");
});

it("쿼리가 같아도 새 관계 옵션과 라벨을 선택기에 반영한다", async () => {
  const user = userEvent.setup();
  const bar = (options: readonly Option[]) => (
    <ResourceFilters
      type="posts"
      query={{ "filter[author]": "u" }}
      filters={[{ name: "filter[author]", label: "작성자", kind: "relation", options }]}
    />
  );
  const result = show(bar([{ value: "u", label: "이전 이름" }]));
  expect(screen.getByRole("combobox", { name: "작성자" }).textContent).toContain("이전 이름");
  result.rerender(
    translated(
      bar([
        { value: "u", label: "새 이름" },
        { value: "v", label: "새 작성자" },
      ]),
    ),
  );
  expect.soft(screen.getByRole("combobox", { name: "작성자" }).textContent).toContain("새 이름");
  await user.click(screen.getByRole("combobox", { name: "작성자" }));
  expect(await screen.findByRole("option", { name: "새 작성자" })).toBeDefined();
  expect(screen.queryByRole("option", { name: "이전 이름" })).toBeNull();
});

it("열린 관계 검색 결과는 같은 기본 옵션의 새 배열을 받아도 유지된다", async () => {
  const user = userEvent.setup();
  const search = async () => [{ value: "s", label: "검색 작성자" }];
  const result = show(relationBar([{ value: "u", label: "기본 작성자" }], search));
  await user.click(screen.getByRole("combobox", { name: "작성자" }));
  await user.type(await screen.findByRole("textbox", { name: "대상 검색" }), "찾을 이름");
  await user.click(screen.getByRole("button", { name: "검색" }));
  expect(await screen.findByRole("option", { name: "검색 작성자" })).toBeDefined();
  result.rerender(translated(relationBar([{ value: "u", label: "기본 작성자" }], search)));
  await user.click(await screen.findByRole("option", { name: "검색 작성자" }));
  await user.click(screen.getByRole("button", { name: "적용" }));
  expect(
    new URL(navigation.push.mock.calls[0]![0], "http://localhost").searchParams.get(
      "filter[author]",
    ),
  ).toBe("s");
});

it("새로고침 뒤 도착한 관계 검색 응답도 열린 팝업에 보인다", async () => {
  const user = userEvent.setup();
  const response = Promise.withResolvers<Option[]>();
  const search = () => response.promise;
  const result = show(relationBar([{ value: "u", label: "기본 작성자" }], search));
  await user.click(screen.getByRole("combobox", { name: "작성자" }));
  await user.type(await screen.findByRole("textbox", { name: "대상 검색" }), "찾을 이름");
  await user.click(screen.getByRole("button", { name: "검색" }));
  result.rerender(translated(relationBar([{ value: "u", label: "기본 작성자" }], search)));
  await act(async () => response.resolve([{ value: "s", label: "늦게 찾은 작성자" }]));
  expect(await screen.findByRole("option", { name: "늦게 찾은 작성자" })).toBeDefined();
});

it("관계 검색 팝업을 닫고 다시 열면 갱신한 기본 옵션을 보인다", async () => {
  const user = userEvent.setup();
  const search = async () => [{ value: "s", label: "검색 작성자" }];
  const result = show(relationBar([{ value: "u", label: "기본 작성자" }], search));
  await user.click(screen.getByRole("combobox", { name: "작성자" }));
  await user.type(await screen.findByRole("textbox", { name: "대상 검색" }), "찾을 이름");
  await user.click(screen.getByRole("button", { name: "검색" }));
  expect(await screen.findByRole("option", { name: "검색 작성자" })).toBeDefined();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  result.rerender(translated(relationBar([{ value: "v", label: "갱신 작성자" }], search)));
  await user.click(screen.getByRole("combobox", { name: "작성자" }));
  expect(await screen.findByRole("option", { name: "갱신 작성자" })).toBeDefined();
  expect(screen.queryByRole("option", { name: "검색 작성자" })).toBeNull();
});

it("관계 검색어를 바꾸거나 비우면 이전 검색 결과를 끝낸다", async () => {
  const user = userEvent.setup();
  const search = async () => [{ value: "s", label: "검색 작성자" }];
  show(relationBar([{ value: "u", label: "기본 작성자" }], search));
  await user.click(screen.getByRole("combobox", { name: "작성자" }));
  const input = await screen.findByRole("textbox", { name: "대상 검색" });
  await user.type(input, "이름");
  await user.click(screen.getByRole("button", { name: "검색" }));
  expect(await screen.findByRole("option", { name: "검색 작성자" })).toBeDefined();
  await user.type(input, " 변경");
  expect(await screen.findByRole("option", { name: "기본 작성자" })).toBeDefined();
  expect(screen.queryByRole("option", { name: "검색 작성자" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "검색" }));
  expect(await screen.findByRole("option", { name: "검색 작성자" })).toBeDefined();
  await user.clear(input);
  expect(await screen.findByRole("option", { name: "기본 작성자" })).toBeDefined();
  expect(screen.queryByRole("option", { name: "검색 작성자" })).toBeNull();
});

it.each(["검색어 변경", "팝업 닫기"])(
  "관계 검색 응답은 세션 종료 뒤 도착하면 반영하지 않는다 (%s)",
  async (end) => {
    const user = userEvent.setup();
    const response = Promise.withResolvers<Option[]>();
    show(relationBar([{ value: "u", label: "기본 작성자" }], () => response.promise));
    await user.click(screen.getByRole("combobox", { name: "작성자" }));
    const input = await screen.findByRole("textbox", { name: "대상 검색" });
    await user.type(input, "이름");
    await user.click(screen.getByRole("button", { name: "검색" }));
    if (end === "검색어 변경") await user.type(input, " 변경");
    else {
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    }
    await act(async () => response.resolve([{ value: "s", label: "끝난 검색 작성자" }]));
    if (end === "팝업 닫기") await user.click(screen.getByRole("combobox", { name: "작성자" }));
    expect(await screen.findByRole("option", { name: "기본 작성자" })).toBeDefined();
    expect(screen.queryByRole("option", { name: "끝난 검색 작성자" })).toBeNull();
  },
);

it("URL 쿼리가 바뀌면 열린 관계 검색을 끝낸다", async () => {
  const user = userEvent.setup();
  const response = Promise.withResolvers<Option[]>();
  const search = () => response.promise;
  const result = show(relationBar([{ value: "u", label: "기본 작성자" }], search));
  await user.click(screen.getByRole("combobox", { name: "작성자" }));
  await user.type(await screen.findByRole("textbox", { name: "대상 검색" }), "이름");
  await user.click(screen.getByRole("button", { name: "검색" }));
  result.rerender(
    translated(
      relationBar([{ value: "v", label: "새 기본 작성자" }], search, { "filter[q]": "새 검색" }),
    ),
  );
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  await act(async () => response.resolve([{ value: "s", label: "이전 쿼리 작성자" }]));
  await user.click(screen.getByRole("combobox", { name: "작성자" }));
  expect(await screen.findByRole("option", { name: "새 기본 작성자" })).toBeDefined();
  expect(screen.queryByRole("option", { name: "이전 쿼리 작성자" })).toBeNull();
});

it("필터 적용 뒤 URL이 바뀌어도 적용 버튼의 포커스를 유지한다", async () => {
  const user = userEvent.setup();
  const bar = (query: Query) => (
    <ResourceFilters
      type="posts"
      query={query}
      filters={[{ name: "filter[q]", label: "검색", kind: "text" }]}
    />
  );
  const result = show(bar({}));
  await user.type(screen.getByRole("searchbox", { name: "검색" }), "적용할 검색");
  const apply = screen.getByRole("button", { name: "적용" });
  await user.click(apply);
  result.rerender(translated(bar({ "filter[q]": "적용할 검색" })));
  expect(document.activeElement).toBe(apply);
});

it("관계 필터는 대상 검색 결과에서 선택한다", async () => {
  const user = userEvent.setup();
  show(
    <ResourceFilters
      type="posts"
      query={{}}
      filters={[
        {
          name: "filter[author]",
          label: "작성자",
          kind: "relation",
          options: [],
          search: async (query) =>
            query === "찾을 이름" ? [{ value: "u", label: "찾은 작성자" }] : [],
        },
      ]}
    />,
  );
  await user.click(screen.getByRole("combobox", { name: "작성자" }));
  await user.type(await screen.findByRole("textbox", { name: "대상 검색" }), "찾을 이름");
  expect((screen.getByRole("textbox", { name: "대상 검색" }) as HTMLInputElement).value).toBe(
    "찾을 이름",
  );
  await user.click(screen.getByRole("button", { name: "검색" }));
  await user.click(await screen.findByRole("option", { name: "찾은 작성자" }));
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect
    .soft(screen.getByRole("combobox", { name: "작성자" }).textContent)
    .toContain("찾은 작성자");
  await user.click(screen.getByRole("button", { name: "적용" }));
  expect(
    new URL(navigation.push.mock.calls[0]![0], "http://localhost").searchParams.get(
      "filter[author]",
    ),
  ).toBe("u");
});

it.each([{}, { "filter[author]": "u" }])(
  "관계 검색 입력의 Enter는 결과 도착 뒤에도 포커스를 유지한다: %j",
  async (query) => {
    const user = userEvent.setup();
    const response = Promise.withResolvers<Option[]>();
    show(relationBar([{ value: "u", label: "기존 작성자" }], () => response.promise, query));
    await user.click(screen.getByRole("combobox", { name: "작성자" }));
    const input = await screen.findByRole("textbox", { name: "대상 검색" });
    await user.type(input, "이름{Enter}");
    expect.soft(document.activeElement).toBe(input);
    await act(async () => response.resolve([{ value: "s", label: "Enter 작성자" }]));
    expect(await screen.findByRole("option", { name: "Enter 작성자" })).toBeDefined();
    expect(document.activeElement).toBe(input);
    expect(navigation.push).not.toHaveBeenCalled();
  },
);

it("정렬은 선언한 후보의 오름·내림만 선택할 수 있다", async () => {
  const user = userEvent.setup();
  show(
    <ResourceFilters
      type="posts"
      query={{}}
      filters={[]}
      sort={[{ value: "title", label: "제목" }]}
    />,
  );
  await user.click(screen.getByRole("combobox", { name: "정렬" }));
  expect(await screen.findAllByRole("option")).toHaveLength(2);
  await user.click(await screen.findByRole("option", { name: "제목 내림차순" }));
  await user.click(screen.getByRole("button", { name: "적용" }));
  expect(
    new URL(navigation.push.mock.calls[0]![0], "http://localhost").searchParams.get("sort"),
  ).toBe("-title");
});
