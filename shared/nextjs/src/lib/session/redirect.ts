import "server-only";
import type { routing } from "../i18n/routing";
import { isProtectedPath } from "./routes";

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
      if (path.replace(/^\/(ko|en)(?=\/|$)/i, "").startsWith("//")) return "/";
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

/** 검증한 목적지에 계정 로케일을 붙인다. */
export function loginDestination(returnTo: string, locale: (typeof routing.locales)[number]) {
  const path = safeReturnTo(returnTo).replace(/^\/(ko|en)(?=\/|[?#]|$)/i, "") || "/";
  const relative = safeReturnTo(path.startsWith("/") ? path : `/${path}`);
  return locale === "ko" ? relative : `/en${relative.replace(/^\/(?=[?#]|$)/, "")}`;
}

export function loginPath(returnTo: string, locale?: (typeof routing.locales)[number]) {
  const path = safeReturnTo(returnTo);
  const language = locale ?? (/^\/en(?:\/|[?#]|$)/i.test(path) ? "en" : "ko");
  return `${language === "en" ? "/en" : ""}/login?${new URLSearchParams({ returnTo: path })}`;
}

export function requiresLogin(pathname: string) {
  try {
    // next-intl의 getNormalizedPathname과 같은 대소문자 무시 접두사 규칙이다.
    const path = canonicalPathname(pathname).replace(/^\/(ko|en)(?=\/|$)/i, "") || "/";
    return isProtectedPath(path);
  } catch {
    // 디코딩·정규화 오류가 로그인 검사를 우회하지 못하게 한다.
    return true;
  }
}
