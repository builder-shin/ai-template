import "server-only";

/** 로케일과 점 구간을 정리한 앱 경로의 로그인 보호 규칙이다. */
export function isProtectedPath(path: string) {
  return ["/me", "/my-posts"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
