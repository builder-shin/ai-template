// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import NotFoundPage from "../src/app/[locale]/not-found";
import ErrorPage from "../src/app/[locale]/error";
import { ko, en } from "../src/lib/i18n/catalogs";
import { intlFixture } from "./test/intl-fixture";

vi.mock("../src/lib/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
afterEach(cleanup);

it.each(["ko", "en"] as const)("%s 404 화면은 skip link의 main 대상 안에 있다", (locale) => {
  render(
    <NextIntlClientProvider {...intlFixture(locale === "ko" ? ko : en, locale)}>
      <NotFoundPage />
    </NextIntlClientProvider>,
  );
  expect(screen.getByRole("main").id).toBe("main");
  expect(screen.getByRole("main").tabIndex).toBe(-1);
  expect(screen.getByRole("heading").closest("main")?.id).toBe("main");
});

it.each(["ko", "en"] as const)(
  "%s 오류 화면은 main 안에서 재시도와 추적 ID를 제공한다",
  async (locale) => {
    const retry = vi.fn();
    render(
      <NextIntlClientProvider {...intlFixture(locale === "ko" ? ko : en, locale)}>
        <ErrorPage
          error={Object.assign(new Error("private"), { digest: "trace-id" })}
          retry={retry}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("main").id).toBe("main");
    expect(screen.getByRole("main").tabIndex).toBe(-1);
    expect(screen.getByRole("alert").closest("main")?.id).toBe("main");
    expect(screen.getByRole("alert").textContent).toContain("trace-id");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: locale === "ko" ? "다시 시도" : "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  },
);
