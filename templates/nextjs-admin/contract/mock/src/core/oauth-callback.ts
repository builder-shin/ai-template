const reserved = new Set([
  "http",
  "https",
  "javascript",
  "data",
  "file",
  "exp",
  "exps",
  "intent",
  "about",
  "chrome",
  "blob",
  "content",
  "ftp",
  "ws",
  "wss",
  "mailto",
  "tel",
]);

/** 설정의 정확한 allowlist 항목만 허용한다. 반환값으로 주소를 정규화하거나 확장하지 않는다. */
export function validOAuthCallback(value: string): boolean {
  if (/[\s\\*]/.test(value)) return false;
  for (let index = 0; index < value.length; index++)
    if (value.charCodeAt(index) < 32 || value.charCodeAt(index) === 127) return false;
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1];
      return (
        !!parsed.hostname &&
        !!authority &&
        !authority.includes("@") &&
        !parsed.username &&
        !parsed.password
      );
    } catch {
      return false;
    }
  }
  const native = /^([a-z][a-z0-9+.-]{1,63}):\/\/oauth\/callback$/.exec(value);
  return !!native?.[1] && !reserved.has(native[1]);
}
