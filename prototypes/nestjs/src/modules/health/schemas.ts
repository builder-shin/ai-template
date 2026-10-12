import { z } from "zod";
import { contractSchema } from "../../core/jsonapi/schemas.js";
export const HealthReport = contractSchema(
  "HealthReport",
  z.object({
    status: z.enum(["ok", "unavailable"]),
    checks: z.record(z.string(), z.enum(["ok", "unavailable"])),
  }),
);
