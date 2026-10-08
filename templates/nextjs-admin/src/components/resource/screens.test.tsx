// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { ResourceList, TableSkeleton } from "./list";
import { ResourceFilters } from "./filters";
import { ResourcePagination } from "./pagination";
import { ResourceForm, ResourceInput, useResourceField } from "./form";
import { ResourceControls } from "./controls";
import { ResourceDetail } from "./detail";
import ko from "../../../messages/ko.json";
import shared from "../../../messages/shared/ko.json";
import { intlFixture } from "../../../scripts/test/intl-fixture";
import type { Query } from "./url";
import type { Option } from "./types";

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
it("관계 검색 뒤 새 옵션을 받으면 검색 결과 대신 갱신한 목록을 보인다", async () => {
  const user = userEvent.setup();
  const bar = (options: readonly Option[]) => (
    <ResourceFilters
      type="posts"
      query={{}}
      filters={[
        {
          name: "filter[author]",
          label: "작성자",
          kind: "relation",
          options,
          search: async () => [{ value: "s", label: "검색 작성자" }],
        },
      ]}
    />
  );
  const result = show(bar([{ value: "u", label: "이전 작성자" }]));
  await user.click(screen.getByRole("combobox", { name: "작성자" }));
  expect(await screen.findByRole("option", { name: "이전 작성자" })).toBeDefined();
  await user.type(await screen.findByRole("textbox", { name: "대상 검색" }), "찾을 이름");
  await user.click(screen.getByRole("button", { name: "검색" }));
  expect(await screen.findByRole("option", { name: "검색 작성자" })).toBeDefined();
  result.rerender(translated(bar([{ value: "v", label: "갱신 작성자" }])));
  await user.click(await screen.findByRole("option", { name: "갱신 작성자" }));
  expect(screen.queryByRole("option", { name: "검색 작성자" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "적용" }));
  expect(
    new URL(navigation.push.mock.calls[0]![0], "http://localhost").searchParams.get(
      "filter[author]",
    ),
  ).toBe("v");
});
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
it("삭제는 확인 전 호출하지 않고 실패 문구를 대화상자에 남긴다", async () => {
  const user = userEvent.setup();
  let calls = 0;
  show(
    <ResourceControls
      controls={[
        {
          label: "삭제",
          confirmation: true,
          destructive: true,
          action: async () => {
            calls++;
            return { ok: false, formError: "시스템 역할은 삭제할 수 없습니다.", fieldErrors: {} };
          },
        },
      ]}
    />,
  );
  await user.click(screen.getByRole("button", { name: "삭제" }));
  expect(calls).toBe(0);
  const dialog = await screen.findByRole("dialog", { name: "삭제" });
  await user.click(within(dialog).getByRole("button", { name: "취소" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(calls).toBe(0);
  await user.click(screen.getByRole("button", { name: "삭제" }));
  const reopened = await screen.findByRole("dialog", { name: "삭제" });
  await user.click(within(reopened).getByRole("button", { name: "확인" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "시스템 역할은 삭제할 수 없습니다.",
  );
  expect(calls).toBe(1);
});
it("확인 없는 동작은 제출하고 성공하면 화면을 갱신한다", async () => {
  show(<ResourceControls controls={[{ label: "발행", action: async () => ({ ok: true }) }]} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "발행" }));
  expect(navigation.refresh).toHaveBeenCalledOnce();
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
