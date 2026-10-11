// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import { FieldDisplay } from "../../components/resource/display";
import type { ScreenRecord } from "../../components/resource/types";
import { ko, en } from "../../lib/i18n/catalogs";
import { intlFixture } from "../../../scripts/test/intl-fixture";
import resource from "./resource";

vi.mock("../../lib/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
afterEach(cleanup);
const record: ScreenRecord = {
  type: "audit-logs",
  id: "log",
  attributes: {
    action: "role.created",
    targetType: "roles",
    targetId: "role/id",
    metadata: {
      name: "검토 역할",
      permissions: ["posts:create"],
      nested: { allowed: true },
      empty: null,
    },
  },
  relationships: { actor: { data: { type: "users", id: "actor" } } },
};
function show(
  name: "metadata" | "targetId" | "actor",
  props: {
    record?: ScreenRecord;
    linkable?: (type: string) => boolean;
    locale?: "ko" | "en";
  } = {},
) {
  const locale = props.locale ?? "ko";
  return render(
    <FieldDisplay
      name={name}
      field={resource.fields![name]!}
      record={props.record ?? record}
      included={[{ type: "users", id: "actor", attributes: { name: null } }]}
      locale={locale}
      timeZone="Asia/Seoul"
      translate={
        createTranslator(intlFixture(locale === "ko" ? ko : en, locale)) as (key: string) => string
      }
      linkable={props.linkable ?? (() => true)}
    />,
  );
}
it("메타데이터의 키·문자열·배열·객체·null을 읽을 수 있게 표시한다", () => {
  show("metadata");
  expect(screen.getByText("name").tagName).toBe("DT");
  expect(screen.getByText("검토 역할").tagName).toBe("DD");
  expect(screen.getByText(/posts:create/).textContent).toBe('[\n  "posts:create"\n]');
  expect(screen.getByText(/allowed/).textContent).toBe('{\n  "allowed": true\n}');
  expect(screen.getByText("null")).toBeDefined();
  expect(screen.queryByText("[object Object]")).toBeNull();
});
it("빈 메타데이터는 범용 빈 값을 표시한다", () => {
  show("metadata", { record: { ...record, attributes: { metadata: {} } } });
  expect(screen.getByText("—")).toBeDefined();
});
it.each(["users", "roles", "posts"])("볼 수 있는 대상만 상세 링크를 만든다: %s", (type) => {
  show("targetId", {
    locale: "en",
    record: { ...record, attributes: { targetType: type, targetId: "role/id" } },
    linkable: (target) => target === type,
  });
  expect(screen.getByRole("link", { name: "role/id" }).getAttribute("href")).toBe(
    `/${type}/role%2Fid`,
  );
});
it("등록된 상세가 없거나 권한이 없으면 대상 id만 표시한다", () => {
  show("targetId", { linkable: () => false });
  expect(screen.getByText("role/id")).toBeDefined();
  expect(screen.queryByRole("link")).toBeNull();
});
it("대상 종류와 id가 없으면 빈 값을 표시한다", () => {
  show("targetId", { record: { ...record, attributes: { targetType: null, targetId: null } } });
  expect(screen.getByText("—")).toBeDefined();
});
it.each(["ko", "en"] as const)(
  "공개 행위자의 이름 대체값은 보기 권한 없이 링크하지 않는다: %s",
  (locale) => {
    show("actor", { locale, linkable: () => false });
    expect(screen.getByText(locale === "ko" ? "사용자" : "User")).toBeDefined();
    expect(screen.queryByRole("link")).toBeNull();
  },
);
it("행위자 없는 로그인 실패는 빈 값을 표시한다", () => {
  show("actor", { record: { ...record, relationships: { actor: { data: null } } } });
  expect(screen.getByText("—")).toBeDefined();
});
