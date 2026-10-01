import "server-only";
import type { routing } from "../i18n/routing";

/** 경로의 중첩 인코딩·역슬래시·제어 문자를 거절하고 쿼리는 보존한다. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  let path = value.split(/[?#]/, 1)[0]!;
  try {
    for (let depth = 0; depth < 5; depth++) {
      if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path))
        return "/";
      const decoded = decodeURIComponent(path);
      if (decoded === path) {
        const parsed = new URL(path, "https://return-to.invalid");
        return parsed.origin === "https://return-to.invalid" && !parsed.pathname.startsWith("//")
          ? value
          : "/";
      }
      path = decoded;
    }
  } catch {
    return "/";
  }
  return "/";
}

export function loginPath(returnTo: string, locale?: (typeof routing.locales)[number]) {
  const path = safeReturnTo(returnTo);
  const language = locale ?? (/^\/en(?:\/|[?#]|$)/.test(path) ? "en" : "ko");
  return `${language === "en" ? "/en" : ""}/login?${new URLSearchParams({ returnTo: path })}`;
}

export function requiresLogin(pathname: string) {
  const path = pathname.replace(/^\/(ko|en)(?=\/|$)/, "") || "/";
  return ["/me", "/my-posts"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
