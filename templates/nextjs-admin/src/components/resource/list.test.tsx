// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../../messages/ko.json";
import shared from "../../../messages/shared/ko.json";
import { intlFixture } from "../../../scripts/test/intl-fixture";
import { createTranslator } from "next-intl";
import { ResourceList, TableSkeleton } from "./list";
import { ListScreen } from "./screen";
import { createApiClient } from "../../lib/api/client";
import { defineResource } from "../../lib/resources/definition";
import { postsFixture } from "../../../scripts/test/resource-fixture";

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
vi.mock("../../lib/resources/actions", () => ({
  saveResourceAction: async () => ({ ok: true }),
  deleteResourceAction: async () => ({ ok: true }),
  runResourceAction: async () => ({ ok: true }),
  searchResourceOptions: async (_type: string, _screen: string, _name: string, query: string) =>
    query === "다른 이름" ? [{ value: "s", label: "검색 작성자" }] : [],
}));

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

it("옵션 밖 URL 관계 값은 included 라벨로 보이고 검색 뒤에도 남는다", async () => {
  const user = userEvent.setup();
  const request = vi.fn(async () => ({
    data: { data: [], meta: { page: { totalPages: 2 } } },
    response: new Response(),
  }));
  const client = createApiClient({ baseUrl: "http://localhost/api/v1", locale: "ko" });
  client.request = request as typeof client.request;
  const resource = defineResource({
    ...postsFixture,
    fields: { author: { relation: { type: "users", label: "name", search: true } } },
    list: { columns: [] as const, filters: { "filter[author]": "relation" as const } },
  });
  show(
    await ListScreen({
      context: {
        resource,
        client,
        permissions: ["posts:manage"],
        locale: "ko",
        timeZone: "Asia/Seoul",
        translate: createTranslator(intlFixture({ ...shared, ...ko })) as (key: string) => string,
        linkable: () => false,
      },
      document: {
        data: [],
        included: [{ type: "users", id: "x", attributes: { name: "URL 작성자" } }],
        meta: { page: { number: 1, totalPages: 1, total: 0 } },
      },
      query: { "filter[author]": "x" },
    }),
  );
  const trigger = screen.getByRole("combobox", { name: "작성자" });
  const form = trigger.closest("form")!;
  expect.soft(trigger.textContent).toContain("URL 작성자");
  await user.click(trigger);
  await user.type(await screen.findByRole("textbox", { name: "대상 검색" }), "다른 이름");
  await user.click(screen.getByRole("button", { name: "검색" }));
  expect(await screen.findByRole("option", { name: "검색 작성자" })).toBeDefined();
  expect.soft(new FormData(form).get("filter[author]")).toBe("x");
  expect.soft(trigger.textContent).toContain("URL 작성자");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  await user.click(screen.getByRole("button", { name: "적용" }));
  expect(
    new URL(navigation.push.mock.calls[0]![0], "http://localhost").searchParams.get(
      "filter[author]",
    ),
  ).toBe("x");
  expect(request).toHaveBeenCalledTimes(1);
});
