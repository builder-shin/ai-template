import "server-only";
import { safeReturnTo } from "../session/redirect";

/** 로그인·세션 정리 화면은 로그인 성공 뒤 돌아갈 목적지가 아니다. */
export function safeLoginReturnTo(value: string | null | undefined): string {
  const returnTo = safeReturnTo(value);
  let pathname = returnTo.split(/[?#]/, 1)[0] ?? "/";
  try {
    for (let depth = 0; depth < 5; depth++) {
      const decoded = decodeURIComponent(pathname);
      if (decoded === pathname) break;
      pathname = decoded;
    }
    pathname = new URL(pathname, "https://return-to.invalid").pathname
      .replace(/^\/(ko|en)(?=\/|$)/i, "")
      .replace(/\/+$/, "");
  } catch {
    return "/";
  }
  return pathname === "/login" || pathname === "/session/clear" ? "/" : returnTo;
}
