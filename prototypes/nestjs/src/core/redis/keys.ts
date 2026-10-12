export function redisNamespace(url: string): string {
  const number = new URL(url).pathname.slice(1) || "0";
  if (!/^(0|14|15)$/.test(number)) throw new Error("Redis DB must be dev0, E2E14 or test15.");
  return `aitpl:${number}`;
}
