import "server-only";
import type { AnyResource } from "./definition";
export function resourceMessageKeys(registry: readonly AnyResource[]) {
  const keys = new Set<string>();
  for (const resource of registry) {
    const prefix = `resources.${resource.type}`;
    keys.add(`${prefix}.title`);
    const fields = [
      ...resource.list.columns,
      ...(resource.detail?.fields ?? []),
      ...Object.keys(resource.create?.fields ?? {}),
      ...Object.keys(resource.edit?.fields ?? {}),
      ...Object.keys(resource.list.filters ?? {}).map((key) => key.slice(7, -1)),
      ...(resource.list.sort?.fields ?? []),
    ];
    for (const name of fields) keys.add(`${prefix}.fields.${name}`);
    for (const [name, field] of Object.entries(resource.fields ?? {}))
      for (const value of [...(field.values ?? []), ...(field.inputValues ?? [])])
        keys.add(`${prefix}.enums.${name}.${value}`);
    for (const action of resource.actions ?? []) keys.add(`${prefix}.actions.${action.name}`);
  }
  return [...keys].sort();
}
function hasMessage(catalog: unknown, key: string) {
  let value = catalog;
  for (const name of key.split(".")) {
    if (typeof value !== "object" || value === null || !Object.hasOwn(value, name)) return false;
    value = (value as Record<string, unknown>)[name];
  }
  return typeof value === "string" && value.trim().length > 0;
}
export function missingResourceMessages(
  registry: readonly AnyResource[],
  catalogs: Record<string, unknown>,
) {
  const configuration = registry.flatMap((resource) => {
    const fields = new Set<string>();
    for (const form of [resource.create, resource.edit])
      for (const [name, kind] of Object.entries(form?.fields ?? {}))
        if (kind === "enum") fields.add(name);
    for (const [key, kind] of Object.entries(resource.list.filters ?? {}))
      if (kind === "enum") fields.add(key.slice(7, -1));
    for (const [name, field] of Object.entries(resource.fields ?? {}))
      if (field.kind === "enum") fields.add(name);
    const metadata = resource.fields as Record<string, { values?: readonly string[] }> | undefined;
    const inputErrors = Object.entries(resource.fields ?? {}).flatMap(([name, field]) =>
      (field.inputValues ?? [])
        .filter((value) => !field.values?.includes(value))
        .map(
          (value) =>
            `${resource.type}.${name}: 입력 열거값이 표시 목록에 없다 (${value}) — inputValues를 values의 일부로 선언한다.`,
        ),
    );
    return [
      ...inputErrors,
      ...[...fields]
        .filter((name) => !metadata?.[name]?.values?.length)
        .map((name) => `${resource.type}.${name}: 열거값 목록 없음 — fields의 values를 선언한다.`),
    ];
  });
  return [
    ...configuration,
    ...Object.entries(catalogs).flatMap(([locale, catalog]) =>
      resourceMessageKeys(registry)
        .filter((key) => !hasMessage(catalog, key))
        .map((key) => `${locale}: ${key} — 메시지 키를 추가한다.`),
    ),
  ];
}
