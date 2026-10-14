export function normalizeOrigins(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => new URL(value).origin))];
}
export function originAllowed(header: string | undefined, allowed: readonly string[]): boolean {
  return header === undefined || allowed.includes(header);
}
