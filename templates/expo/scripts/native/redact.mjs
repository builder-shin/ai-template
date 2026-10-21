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
