/**
 * 요청을 보낸 쪽(IP, User-Agent). 감사 로그, 세션 목록, 레이트 리밋이 쓴다(FastAPI의 core/clients.py).
 *
 * - IP는 연결의 상대 주소다. IPv4를 IPv6로 감싼 주소(::ffff:127.0.0.1)는 IPv4로 적는다.
 * - FastAPI(uvicorn)처럼 이 PC(127.0.0.1, ::1)가 보낸 X-Forwarded-For만 믿는다. 목록을 뒤에서부터 보며
 *   믿는 주소가 아닌 첫 주소를 쓰고, 모두 믿는 주소면 맨 앞 주소를 쓴다.
 * - 주소를 모르면(app.request로 부른 테스트) null이다. 레이트 리밋은 이때 "unknown"으로 센다.
 * - User-Agent는 500자까지 담고, 없거나 비었으면 null이다.
 */

import type { Context } from "hono";
import type { AppEnv } from "../context.ts";

/** 세션 목록에 보여 줄 User-Agent의 최대 길이(코드 포인트). */
export const USER_AGENT_MAX = 500;
const TRUSTED_PROXIES: ReadonlySet<string> = new Set(["127.0.0.1", "::1"]);
const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;
const HOST_AND_PORT = /^([^:]*):\d+$/;

export interface Client {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

/** X-Forwarded-For 항목의 호스트. 포트(1.2.3.4:80, [::1]:80)는 뗀다. */
function forwardedHost(entry: string): string {
  if (!entry.startsWith("[")) return HOST_AND_PORT.exec(entry)?.[1] ?? entry;
  const end = entry.indexOf("]");
  if (end === -1) return entry;
  const rest = entry.slice(end + 1);
  return rest === "" || rest.startsWith(":") ? entry.slice(1, end) : entry;
}

function forwardedClient(header: string): string {
  const hosts = header.split(",").map((entry) => forwardedHost(entry.trim()));
  const untrusted = hosts.toReversed().find((host) => !TRUSTED_PROXIES.has(host));
  return untrusted ?? hosts[0] ?? "";
}

/** 연결의 상대 주소. app.request로 부른 테스트에는 연결이 없다(c.env가 없다). */
function peerAddress(c: Context<AppEnv>): string | undefined {
  const bindings = c.env as AppEnv["Bindings"] | undefined;
  const address = bindings?.incoming?.socket.remoteAddress;
  return address === undefined ? undefined : (IPV4_MAPPED.exec(address)?.[1] ?? address);
}

/** 요청의 클라이언트 IP. 연결 주소를 모르면 null이다. */
export function clientIp(c: Context<AppEnv>): string | null {
  const address = peerAddress(c);
  if (address === undefined) return null;
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded === undefined || !TRUSTED_PROXIES.has(address)) return address;
  return forwardedClient(forwarded) || address;
}

export function clientOf(c: Context<AppEnv>): Client {
  const userAgent = c.req.header("user-agent");
  return {
    ip: clientIp(c),
    userAgent: userAgent ? Array.from(userAgent).slice(0, USER_AGENT_MAX).join("") : null,
  };
}
