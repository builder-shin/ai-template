// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FieldDisplay } from "./display";
vi.mock("../../lib/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
afterEach(cleanup);
const record = {
  type: "posts",
  id: "1",
  attributes: {
    body: "줄1\n줄2",
    createdAt: "2026-10-08T00:00:00Z",
    status: "draft",
    enabled: true,
  },
  relationships: {
    author: { data: { type: "users", id: "u" } },
    roles: { data: [{ type: "roles", id: "r" }] },
    coverImage: { data: { type: "files", id: "f" } },
  },
};
const included = [
  { type: "users", id: "u", attributes: { name: "작성자" } },
  { type: "roles", id: "r", attributes: { name: "관리 역할" } },
  { type: "files", id: "f", attributes: { filename: "파일.png" } },
];
const translate = (key: string) =>
  ({ "resource.yes": "예", "resources.posts.enums.status.draft": "초안" })[key] ?? key;
function show(
  name: string,
  kind: NonNullable<Parameters<typeof FieldDisplay>[0]["field"]["kind"]>,
) {
  render(
    <FieldDisplay
      name={name}
      field={{ kind }}
      record={record}
      included={included}
      locale="ko"
      timeZone="Asia/Seoul"
      translate={translate}
      linkable={() => true}
    />,
  );
}
it("관계는 included의 이름과 대상 상세 링크를 쓴다", () => {
  show("author", "relation");
  expect(screen.getByRole("link", { name: "작성자" }).getAttribute("href")).toBe("/users/u");
});
it("다중 관계는 배지 목록으로, 파일은 이름으로 표시한다", () => {
  show("roles", "relation-many");
  show("coverImage", "file");
  expect(
    screen.getByRole("link", { name: "관리 역할" }).closest("[data-slot=badge]"),
  ).not.toBeNull();
  expect(screen.getByText("파일.png")).toBeDefined();
});
it("날짜는 설정 시간대로, 열거값과 참거짓은 번역으로 표시한다", () => {
  show("createdAt", "date");
  show("status", "enum");
  show("enabled", "boolean");
  show("body", "textarea");
  expect(screen.getByText(/오전 9:00/)).toBeDefined();
  expect(screen.getByText("초안").getAttribute("data-slot")).toBe("badge");
  expect(screen.getByText("예")).toBeDefined();
  expect(screen.getByText(/줄1/).textContent).toBe("줄1\n줄2");
});
it("선언의 표시 override는 원래 값과 레코드를 받는다", () => {
  render(
    <FieldDisplay
      name="status"
      field={{
        display: ({ value, record }) => (
          <strong>
            {String(value)}:{record.id}
          </strong>
        ),
      }}
      record={record}
      included={included}
      locale="ko"
      timeZone="Asia/Seoul"
      translate={translate}
      linkable={() => true}
    />,
  );
  expect(screen.getByText("draft:1").tagName).toBe("STRONG");
});

it("등록되지 않았거나 볼 수 없는 대상의 관계는 링크 없이 이름만 보인다", () => {
  render(
    <FieldDisplay
      name="author"
      field={{ kind: "relation" }}
      record={record}
      included={included}
      locale="ko"
      timeZone="Asia/Seoul"
      translate={translate}
      linkable={() => false}
    />,
  );
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText("작성자")).toBeDefined();
});

it.each(["ko", "en"] as const)(
  "이름 없는 사용자는 직접 표시와 관계 라벨에 번역한 대체값을 쓴다: %s",
  (locale) => {
    const unnamed = locale === "ko" ? "사용자" : "User";
    const user = { type: "users", id: "u", attributes: { name: null } };
    const props = {
      included: [user],
      locale,
      timeZone: "Asia/Seoul",
      translate: (key: string) => (key === "layout.unnamedUser" ? unnamed : key),
      linkable: () => false,
    };
    render(
      <>
        <FieldDisplay {...props} name="name" field={{}} record={user} />
        <FieldDisplay
          {...props}
          name="author"
          field={{ kind: "relation", relation: { type: "users", label: "name" } }}
          record={record}
        />
      </>,
    );
    expect(screen.getAllByText(unnamed)).toHaveLength(2);
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText("u")).toBeNull();
  },
);
