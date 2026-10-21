import "server-only";
import { isIP } from "node:net";

/** zone·포트·목록이 없는 단일 IP 주소만 허용한다. */
export function isClientIp(value: string): boolean {
  return !value.includes("%") && isIP(value) !== 0;
}

/** ingress가 항상 덮어쓰고 BFF 직접 접근을 막은 구성에서만 켠다. */
export function clientIpFromHeaders(headers: Pick<Headers, "get">, trustedHeader: string) {
  if (!trustedHeader) return undefined;
  const value = headers.get(trustedHeader);
  return value && isClientIp(value) ? value : undefined;
}
