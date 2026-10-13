import type { ErrorCode } from "./error-codes.js";
import { errorCodeSchema } from "./error-codes.js";
import { z } from "zod";
import { registerComponent } from "./schemas.js";
export const errorSourceSchema = registerComponent(
  "ErrorSource",
  z.object({ pointer: z.string().optional(), parameter: z.string().optional() }),
);
export const errorObjectSchema = registerComponent(
  "ErrorObject",
  z.object({
    status: z.string(),
    code: errorCodeSchema,
    title: z.string(),
    detail: z.string().optional(),
    source: errorSourceSchema.optional(),
    meta: z.object({ params: z.record(z.string(), z.unknown()).optional() }).optional(),
  }),
);
export const errorDocumentSchema = registerComponent(
  "ErrorDocument",
  z.object({ errors: z.array(errorObjectSchema), meta: z.object({ traceId: z.string() }) }),
);
export interface ApiErrorInit {
  status: number;
  code: ErrorCode;
  title: string;
  detail?: string;
  source?: { pointer: string } | { parameter: string } | { header: string };
  meta?: Record<string, unknown>;
  headers?: Record<string, string>;
}
export class ApiError extends Error {
  constructor(readonly init: ApiErrorInit) {
    super(init.title);
    this.name = "ApiError";
  }
}
export class ApiErrors extends Error {
  constructor(
    readonly status: number,
    readonly errors: readonly ApiError[],
  ) {
    super("API 오류");
    this.name = "ApiErrors";
  }
}
