import {
  createFormatter,
  createTranslator,
  NextIntlClientProvider,
  useFormatter,
  useTimeZone,
} from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorCodes } from "../generated/error-codes";
import { resolveRequestConfig } from "./request";

afterEach(() => vi.unstubAllEnvs());

describe("요청 메시지와 시간대", () => {
  it.each(["ko", "en"] as const)(
    "%s의 모든 에러 메시지가 코드와 meta.params로 번역된다",
    async (locale) => {
      const config = await resolveRequestConfig(Promise.resolve(locale));
      const t = createTranslator({ ...config, namespace: "errors" });
      for (const code of errorCodes) {
        const message = t(code, { min: 3, max: 100 });
        expect(message).not.toBe(`errors.${code}`);
        expect(message).not.toContain("{");
      }
      expect(t("validation.too_short", { min: 3 })).toContain("3");
      expect(t("validation.too_long", { max: 100 })).toContain("100");
      expect(t("file.too_large", { max: 100 })).toContain("100");
    },
  );

  it.each([undefined, "fr"])("로케일이 없거나 지원하지 않으면 ko를 쓴다", async (locale) => {
    const config = await resolveRequestConfig(Promise.resolve(locale));
    expect(config.locale).toBe("ko");
    expect(config.messages.home.title).toBe("Web 템플릿");
  });

  it.each(["Asia/Seoul", "America/New_York"])(
    "서버와 클라이언트가 TIME_ZONE=%s로 같은 날짜를 만든다",
    async (timeZone) => {
      vi.stubEnv("TIME_ZONE", timeZone);
      const config = await resolveRequestConfig(Promise.resolve("en"));
      const date = new Date("2026-01-01T00:00:00Z");
      const options = { dateStyle: "short", timeStyle: "short" } as const;
      const server = createFormatter(config).dateTime(date, options);
      function ClientDate() {
        const format = useFormatter();
        return <time data-zone={useTimeZone()}>{format.dateTime(date, options)}</time>;
      }
      const client = renderToStaticMarkup(
        <NextIntlClientProvider {...config}>
          <ClientDate />
        </NextIntlClientProvider>,
      );
      expect(client).toBe(`<time data-zone="${timeZone}">${server}</time>`);
      expect(server).toContain(timeZone === "Asia/Seoul" ? "1/1/26" : "12/31/25");
    },
  );

  it("시간대 기본값을 쓰고 잘못된 TIME_ZONE은 거절한다", async () => {
    vi.stubEnv("TIME_ZONE", undefined);
    expect((await resolveRequestConfig(Promise.resolve("ko"))).timeZone).toBe("Asia/Seoul");
    vi.stubEnv("TIME_ZONE", "invalid/time-zone");
    await expect(resolveRequestConfig(Promise.resolve("ko"))).rejects.toThrow();
  });
});
