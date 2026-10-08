import "server-only";

/** 로케일을 뺀 경로는 로그인 화면 외에 모두 보호한다. */
export function isProtectedPath(pathname: string) {
  return pathname !== "/login";
}
