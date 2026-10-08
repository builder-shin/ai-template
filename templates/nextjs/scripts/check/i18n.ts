import { messageCollisions, type Catalog } from "../../src/lib/i18n/merge";

type Catalogs = { ko: Catalog; en: Catalog };

function flatten(catalog: Catalog, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(catalog).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === "string" ? [[path, value]] : Object.entries(flatten(value, path));
    }),
  );
}

function checkPair(catalogs: Catalogs, directory: string, codes: readonly string[]): string[] {
  const flat = { ko: flatten(catalogs.ko), en: flatten(catalogs.en) };
  const keys = new Set([
    ...Object.keys(flat.ko),
    ...Object.keys(flat.en),
    ...codes.map((code) => `errors.${code}`),
  ]);
  const problems: string[] = [];
  for (const locale of ["ko", "en"] as const) {
    for (const key of keys) {
      const value = flat[locale][key];
      if (value === undefined)
        problems.push(`${directory}/${locale}.json: ${key} — 빠진 번역을 추가한다.`);
      else if (!value.trim())
        problems.push(`${directory}/${locale}.json: ${key} — 빈 번역을 채운다.`);
    }
  }
  return problems;
}

export function checkI18n(app: Catalogs, codes: readonly string[], shared: Catalogs): string[] {
  return [
    ...checkPair(shared, "messages/shared", codes),
    ...checkPair(app, "messages", []),
    ...(["ko", "en"] as const).flatMap((locale) =>
      messageCollisions(shared[locale], app[locale]).map(
        (key) =>
          `messages/${locale}.json: ${key}이 messages/shared/${locale}.json과 겹친다 — 중복 키를 한 카탈로그에만 둔다.`,
      ),
    ),
  ];
}
