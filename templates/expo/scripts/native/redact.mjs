import { stripVTControlCharacters } from "node:util";
export function redactNative(value, secrets = []) {
  let text = stripVTControlCharacters(String(value));
  for (const secret of secrets)
    if (typeof secret === "string" && secret.length) text = text.replaceAll(secret, "[redacted]");
  return text
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s<>"')]+/gi, "[runtime URL]")
    .replace(/(authorization["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^\s,}"']+/gi, "$1[redacted]")
    .replace(
      /((?:refreshToken|accessToken|verifier|password|authorization|code|token)["']?\s*[:=]\s*["']?)[^\s,}"']+/gi,
      "$1[redacted]",
    )
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[token]");
}
export function safeNativeReason(value, secrets) {
  if (!Array.isArray(secrets)) return "";
  return redactNative(value, secrets)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/gi, "[identifier]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, (word) =>
      [
        "NSInvalidArgumentException",
        "NSInternalInconsistencyException",
        "UnrecognizedSelectorException",
      ].includes(word)
        ? word
        : "[opaque]",
    )
    .split(/\r?\n/)
    .slice(0, 3)
    .map((line) => line.replace(/\S*[\\/].*$/, "[source path omitted]"))
    .join(" ")
    .slice(0, 600);
}
