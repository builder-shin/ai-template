// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../../messages/ko.json";
import shared from "../../../messages/shared/ko.json";
import { intlFixture } from "../../../scripts/test/intl-fixture";
import { ResourceDetail } from "./detail";

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
