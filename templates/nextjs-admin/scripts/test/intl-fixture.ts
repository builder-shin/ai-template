import type { AbstractIntlMessages, Locale } from "next-intl";
import { envSchema } from "../../src/lib/env";

export function intlFixture(messages: AbstractIntlMessages, locale: Locale = "ko") {
  return {
    locale,
    messages,
    timeZone: envSchema.shape.TIME_ZONE.parse(process.env.TIME_ZONE),
  };
}
