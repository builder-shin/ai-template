export type Query = Record<string, string | string[] | undefined>;
export function resourceUrl(
  type: string,
  query: Query,
  changes: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries({ ...query, ...changes }))
    if (typeof value === "string" && value) params.set(name, value);
  params.set("page[size]", "20");
  return `/${type}?${params}`;
}
