import { isIP } from "node:net";
export function normalizeOrigin(value: string): string {
  if (value.includes("*") || value.includes("\\") || /[\r\n\t]/.test(value))
    throw new Error("Invalid realtime origin.");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid realtime origin.");
  const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1]?.split("@").at(-1) ?? "";
  const rawHost = authority.startsWith("[")
    ? authority.slice(1, authority.indexOf("]"))
    : (authority.split(":")[0] ?? "");
  if (/[^\x20-\x7e]/.test(rawHost)) throw new Error("Non-ASCII host.");
  if (isIP(url.hostname) === 4 && (isIP(rawHost) !== 4 || rawHost !== url.hostname))
    throw new Error("Abbreviated IPv4 origin.");
  return url.origin.toLowerCase();
}
export function allowedOrigins(value: string): ReadonlySet<string> {
  return new Set(
    value
      .split(",")
      .filter(Boolean)
      .map((x) => normalizeOrigin(x.trim())),
  );
}
