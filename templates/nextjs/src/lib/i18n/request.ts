import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { envSchema } from "../env";
import { routing } from "./routing";

const catalogs = {
  ko: () => import("../../../messages/ko.json"),
  en: () => import("../../../messages/en.json"),
};

export async function resolveRequestConfig(requestLocale: Promise<string | undefined>) {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await catalogs[locale]()).default,
    timeZone: envSchema.shape.TIME_ZONE.parse(process.env.TIME_ZONE),
  };
}

export default getRequestConfig(({ requestLocale }) => resolveRequestConfig(requestLocale));
