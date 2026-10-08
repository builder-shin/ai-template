// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { ResourceList, TableSkeleton } from "./list";
import { ResourceFilters } from "./filters";
import { ResourcePagination } from "./pagination";
import { ResourceDetail } from "./detail";
import ko from "../../../messages/ko.json";
import shared from "../../../messages/shared/ko.json";
import { intlFixture } from "../../../scripts/test/intl-fixture";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("../../lib/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
  useRouter: () => navigation,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider {...intlFixture({ ...shared, ...ko })}>{node}</NextIntlClientProvider>,
  );
}

it("목록의 행과 키보드가 상세를 열고 내부 버튼은 행 이동을 막는다", async () => {
  const user = userEvent.setup();
  show(
    <ResourceList
      title="글"
      columns={["제목", "상태"]}
      rows={[
        {
          id: "1",
          href: "/posts/1",
          cells: ["첫 글", "초안"],
          controls: <button>발행</button>,
        },
      ]}
      createHref="/posts/new"
    />,
  );
  expect(screen.getByRole("link", { name: "생성" }).getAttribute("href")).toBe("/posts/new");
  await user.click(screen.getByText("초안"));
  expect(navigation.push).toHaveBeenCalledWith("/posts/1");
  navigation.push.mockClear();
  await user.click(screen.getByRole("button", { name: "발행" }));
  expect(navigation.push).not.toHaveBeenCalled();
  screen.getByRole("row", { name: /첫 글/ }).focus();
  await user.keyboard("{Enter}");
  expect(navigation.push).toHaveBeenCalledWith("/posts/1");
});
it("빈 목록과 표 스켈레톤에 로딩 문구가 없다", () => {
  const result = show(<ResourceList title="글" columns={["제목"]} rows={[]} />);
  expect(screen.getByText("결과가 없습니다.")).toBeDefined();
  result.unmount();
  show(<TableSkeleton columns={3} />);
  expect(screen.getAllByRole("row")).toHaveLength(6);
  expect(screen.getByRole("table").textContent).toBe("");
});
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
it("페이지 링크는 필터와 정렬을 유지하고 크기는 20이다", () => {
  show(
    <ResourcePagination
      type="posts"
      query={{ "filter[q]": "단어", sort: "title" }}
      page={{ number: 2, totalPages: 3, total: 45 }}
    />,
  );
  const url = new URL(
    screen.getByRole("link", { name: "다음" }).getAttribute("href")!,
    "http://localhost",
  );
  expect(url.searchParams.get("page[number]")).toBe("3");
  expect(url.searchParams.get("page[size]")).toBe("20");
  expect(url.searchParams.get("filter[q]")).toBe("단어");
  expect(url.searchParams.get("sort")).toBe("title");
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
  await user.click(screen.getByRole("button", { name: "적용" }));
  expect(
    new URL(navigation.push.mock.calls[0]![0], "http://localhost").searchParams.get(
      "filter[author]",
    ),
  ).toBe("u");
});
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
it("상세는 선언 순서의 필드와 override 내용을 표시한다", () => {
  show(
    <ResourceDetail
      title="글"
      fields={[
        { label: "제목", value: "첫 글" },
        { label: "본문", value: <strong>바꾼 표시</strong> },
      ]}
    >
      <button>수정</button>
    </ResourceDetail>,
  );
  expect(screen.getByText("바꾼 표시").tagName).toBe("STRONG");
  expect(screen.getByRole("button", { name: "수정" })).toBeDefined();
});
