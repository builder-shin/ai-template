function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
/** Prisma 7은 pg 어댑터의 제약 정보를 meta.driverAdapterError.cause에 담는다. */
export function isUniqueViolation(error: unknown, target?: string): boolean {
  const value = record(error);
  if (value.code !== "P2002") return false;
  if (!target) return true;
  const meta = record(value.meta);
  if (Array.isArray(meta.target)) return meta.target.includes(target);
  if (typeof meta.target === "string") return meta.target === target;
  const constraint = record(record(record(meta.driverAdapterError).cause).constraint);
  if (Array.isArray(constraint.fields)) return constraint.fields.includes(target);
  return typeof constraint.index === "string" && constraint.index.endsWith(`_${target}_key`);
}
