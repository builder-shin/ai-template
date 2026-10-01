type Catalog = { [key: string]: string | Catalog };

function flatten(catalog: Catalog, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(catalog).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === "string" ? [[path, value]] : Object.entries(flatten(value, path));
    }),
  );
}

export function checkI18n(
  catalogs: { ko: Catalog; en: Catalog },
  codes: readonly string[],
): string[] {
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
      if (value === undefined) problems.push(`${locale}: ${key} — 빠진 번역을 추가한다.`);
      else if (!value.trim()) problems.push(`${locale}: ${key} — 빈 번역을 채운다.`);
    }
  }
  return problems;
}
