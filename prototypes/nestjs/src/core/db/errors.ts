import { Prisma } from "../../generated/prisma/client.js";
export function isUniqueViolation(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
    return false;
  const target = error.meta?.target;
  const constraint = error.meta?.driverAdapterError;
  // Prisma 7 adapter exposes the original constraint through the structured cause.
  const cause =
    typeof constraint === "object" && constraint !== null && "cause" in constraint
      ? constraint.cause
      : undefined;
  const fields =
    typeof cause === "object" && cause !== null && "constraint" in cause
      ? cause.constraint
      : undefined;
  const index =
    typeof fields === "object" && fields !== null && "index" in fields ? fields.index : undefined;
  return (
    index === `uq_users_${field}` ||
    (Array.isArray(target) && target.includes(field)) ||
    (typeof target === "string" && target.includes(field)) ||
    (typeof fields === "object" &&
      fields !== null &&
      "fields" in fields &&
      Array.isArray(fields.fields) &&
      fields.fields.includes(field))
  );
}
export function safeInt64(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new RangeError("Stored int64 exceeds JSON safe integer precision.");
  return number;
}
