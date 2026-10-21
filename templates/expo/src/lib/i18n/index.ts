import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import ko from "./messages/ko.json";
import en from "./messages/en.json";

export type Locale = "ko" | "en";
export function locale(value: unknown): Locale {
  return value === "en" ? "en" : "ko";
}
void i18n.use(initReactI18next).init({
  resources: { ko: { translation: ko }, en: { translation: en } },
  lng: locale(getLocales()[0]?.languageCode),
  fallbackLng: "ko",
  interpolation: { escapeValue: false },
});
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof ko };
  }
}
export default i18n;
