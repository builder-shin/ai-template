export function redisNamespace(url: string): "aitpl:0" | "aitpl:14" | "aitpl:15" {
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, "") || "0";
  if (!["redis:", "rediss:"].includes(parsed.protocol) || !["0", "14", "15"].includes(database))
    throw new Error("Redis DB는 개발 0, E2E 14, 시험 15만 쓴다");
  return `aitpl:${database}` as "aitpl:0" | "aitpl:14" | "aitpl:15";
}
