import type { MobileEnv } from "../config/env";

const oauthErrors = new Set(["auth.oauth_denied", "auth.oauth_failed", "auth.account_deactivated"]);
export interface AppLink {
  kind: "oauth" | "verify-email" | "reset-password";
  value: string;
}
export function parseAppLink(value: string, env: MobileEnv): AppLink | null {
  if (value.length > 4096 || /[\s#\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash || [...url.searchParams].length !== 1) return null;
    const rawPath = value.split("?")[0];
    let kind: AppLink["kind"];
    if (rawPath === `${env.scheme}://oauth/callback`) kind = "oauth";
    else if (rawPath === `${env.scheme}://verify-email`) kind = "verify-email";
    else if (rawPath === `${env.scheme}://reset-password`) kind = "reset-password";
    else {
      const front = new URL(env.frontendUrl);
      const pathBytes = /^https?:\/\/[^/?#]+([^?#]*)/.exec(value)?.[1];
      if (url.origin !== front.origin || pathBytes !== url.pathname) return null;
      const prefix = front.pathname.replace(/\/$/, "");
      if (!url.pathname.startsWith(`${prefix}/`)) return null;
      const match = /^\/(?:ko\/|en\/)?(verify-email|reset-password)$/.exec(
        url.pathname.slice(prefix.length),
      );
      if (!match) return null;
      kind = match[1] as "verify-email" | "reset-password";
    }
    if (kind === "oauth" && url.searchParams.has("error")) {
      const error = url.searchParams.get("error")!;
      return oauthErrors.has(error) ? { kind, value: error } : null;
    }
    const token = url.searchParams.get(kind === "oauth" ? "code" : "token");
    return token && /^[A-Za-z0-9_-]{1,512}$/.test(token) ? { kind, value: token } : null;
  } catch {
    return null;
  }
}
