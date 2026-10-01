/** 환경 파일은 런타임 로더만 읽는다. 외부 백엔드 주소에서는 목을 시작하지 않는다. */
export function isStandalone(apiBaseUrl) {
  if (apiBaseUrl === undefined) return true;
  try {
    const url = new URL(apiBaseUrl);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.port === "4010" &&
      /^\/api\/v1\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
