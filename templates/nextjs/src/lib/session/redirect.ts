import "server-only";
import type { routing } from "../i18n/routing";

/** next-intl처럼 한 번만 decodeURI·경로 정리 뒤 URL의 점 구간을 정규화한다. */
function canonicalPathname(pathname: string) {
  const path = decodeURI(pathname)
    .replace(/\\/g, "%5C")
    .replace(/[\t\n\r]/g, "")
    .replace(/\/+/g, "/");
  return new URL(path, "https://return-to.invalid").pathname;
}

/** 경로의 중첩 인코딩·역슬래시·제어 문자를 거절하고 쿼리·hash는 보존한다. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  const pathname = value.split(/[?#]/, 1)[0]!;
  let path = pathname;
  try {
    for (let depth = 0; depth < 5; depth++) {
      if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path))
        return "/";
      if (path.replace(/^\/(ko|en)(?=\/|$)/, "").startsWith("//")) return "/";
      const decoded = decodeURIComponent(path);
      if (decoded === path) {
        const parsed = new URL(path, "https://return-to.invalid");
        return parsed.origin === "https://return-to.invalid" && !parsed.pathname.startsWith("//")
          ? canonicalPathname(pathname) + value.slice(pathname.length)
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
  try {
    const path = canonicalPathname(pathname).replace(/^\/(ko|en)(?=\/|$)/, "") || "/";
    return ["/me", "/my-posts"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  } catch {
    // 디코딩·정규화 오류가 로그인 검사를 우회하지 못하게 한다.
    return true;
  }
}
