import { expect, it } from "vitest";
import { clientIpFromHeaders } from "./client-ip";

it.each(["192.0.2.1", "2001:db8::2", "::ffff:192.0.2.3"])(
  "(%s) 설정한 헤더의 단일 IP만 선택한다",
  (ip) => {
    const headers = new Headers({ "x-ingress-client-ip": ip, "x-forwarded-for": "203.0.113.1" });
    expect(clientIpFromHeaders(headers, "x-ingress-client-ip")).toBe(ip);
    expect(clientIpFromHeaders(headers, "")).toBeUndefined();
  },
);
it.each([
  null,
  "",
  "unknown",
  "192.0.2.1, 192.0.2.2",
  "192.0.2.1:80",
  "[::1]",
  "fe80::1%eth0",
  "192.0.2. 1",
  " 192.0.2.1",
])("(%s) 누락·무효 값은 기존 BFF 주소 예산으로 돌아간다", (value) => {
  expect(clientIpFromHeaders({ get: () => value }, "x-ingress-client-ip")).toBeUndefined();
});
