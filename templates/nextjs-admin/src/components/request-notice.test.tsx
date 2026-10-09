// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { notFound, redirect } from "next/navigation";
import { afterEach, expect, it, vi } from "vitest";
import { RequestNotice } from "./request-notice";
import { ApiError, type ApiIssue } from "../lib/api/errors";
import { ko, en } from "../lib/i18n/catalogs";
import { intlFixture } from "../../scripts/test/intl-fixture";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: "ko" | "en"; namespace: "auth" }) =>
    createTranslator({ ...intlFixture(locale === "ko" ? ko : en, locale), namespace }),
}));
afterEach(cleanup);
function error(status: number, code: ApiIssue["code"], retryAfter?: number) {
  return new ApiError({
    status,
    errors: [{ code, params: {} }],
    traceId: "test-trace",
    retryAfter: retryAfter ?? null,
  });
}

it.each([
  [400, "jsonapi.invalid_query"],
  [403, "permission.denied"],
  [404, "resource.not_found"],
  [409, "resource.conflict"],
  [429, "rate_limit.exceeded"],
] as const)("%s 응답은 ko/en의 번역 안내를 같은 화면에 보인다", async (status, code) => {
  for (const locale of ["ko", "en"] as const) {
    const t = createTranslator({
      ...intlFixture(locale === "ko" ? ko : en, locale),
      namespace: "errors",
    });
    render(await RequestNotice({ error: error(status, code), locale }));
    expect(screen.getByRole("alert").textContent).toBe(t(code));
    cleanup();
  }
});

it.each(["ko", "en"] as const)("%s: 429는 Retry-After도 번역한다", async (locale) => {
  render(await RequestNotice({ error: error(429, "rate_limit.exceeded", 17), locale }));
  expect(screen.getByRole("alert").textContent).toContain(
    locale === "ko" ? "17초 뒤에 다시 시도하세요." : "Try again in 17 seconds.",
  );
});

it.each([
  error(401, "auth.unauthenticated"),
  error(500, "internal.unexpected"),
  new Error("서버 오류"),
  ...[() => redirect("/login"), () => notFound()].map((control) => {
    try {
      control();
    } catch (caught) {
      return caught;
    }
    throw new Error("Next 제어 흐름 예외가 없다.");
  }),
])("인증·서버·Next 제어 흐름 오류 %#: 그대로 다시 던진다", async (caught) => {
  await expect(RequestNotice({ error: caught, locale: "ko" })).rejects.toBe(caught);
});
