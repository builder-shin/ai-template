// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../../messages/ko.json";
import shared from "../../../messages/shared/ko.json";
import { intlFixture } from "../../../scripts/test/intl-fixture";
import { ResourcePagination } from "./pagination";

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
