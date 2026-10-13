import { z } from "zod";
import { registerComponent } from "../../core/jsonapi/schemas.js";
import { defineOperation } from "../../core/jsonapi/operation.js";
const status = z.enum(["ok", "unavailable"]);
export const healthReportSchema = registerComponent(
  "HealthReport",
  z.object({
    status,
    checks: z.record(z.string(), status),
  }),
);
const response = {
  schema: "HealthReport",
  contentType: "application/json",
  description: "헬스체크 결과다",
} as const;
export const live = defineOperation({
  operationId: "Health_live",
  method: "GET",
  path: "/health/live",
  tags: ["health"],
  summary: "프로세스가 살아 있는지 확인한다",
  auth: "none",
  responses: { 200: response },
  errors: [],
});
export const ready = defineOperation({
  operationId: "Health_ready",
  method: "GET",
  path: "/health/ready",
  tags: ["health"],
  summary: "의존 대상의 연결을 확인한다",
  auth: "none",
  responses: { 200: response, 503: response },
  errors: [],
});
