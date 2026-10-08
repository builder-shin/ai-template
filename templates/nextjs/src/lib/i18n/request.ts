import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { envSchema } from "../env";
import { routing } from "./routing";
import { mergeMessages } from "./merge";

const catalogs = {
  ko: async () => {
    const [shared, app] = await Promise.all([
      import("../../../messages/shared/ko.json"),
      import("../../../messages/ko.json"),
    ]);
    return mergeMessages(shared.default, app.default);
  },
  en: async () => {
    const [shared, app] = await Promise.all([
      import("../../../messages/shared/en.json"),
      import("../../../messages/en.json"),
    ]);
    return mergeMessages(shared.default, app.default);
  },
};

export async function resolveRequestConfig(requestLocale: Promise<string | undefined>) {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: await catalogs[locale](),
    timeZone: envSchema.shape.TIME_ZONE.parse(process.env.TIME_ZONE),
  };
}

export default getRequestConfig(({ requestLocale }) => resolveRequestConfig(requestLocale));
