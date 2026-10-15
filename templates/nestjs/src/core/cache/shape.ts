import { z } from "zod";
import { createHash } from "node:crypto";
export function shapeHash(schema: z.ZodType): string {
  return createHash("sha256")
    .update(JSON.stringify(z.toJSONSchema(schema)))
    .digest("hex")
    .slice(0, 16);
}
