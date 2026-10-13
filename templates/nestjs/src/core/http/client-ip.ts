import { isIP } from "node:net";

function normalize(address: string): string {
  const ipv4 = address.replace(/^::ffff:/i, "");
  return isIP(ipv4) === 4 ? ipv4 : address;
}

export function clientIp(
  remoteAddress: string,
  forwardedFor: string | undefined,
  trusted: readonly string[],
): string {
  const remote = normalize(remoteAddress);
  const proxies = new Set(trusted.map(normalize));
  if (!proxies.has(remote) || !forwardedFor) return remote;
  let current = remote;
  for (const part of forwardedFor.split(",").reverse()) {
    if (!proxies.has(current)) break;
    const address = normalize(part.trim());
    if (!isIP(address)) return remote;
    current = address;
  }
  return current;
}
