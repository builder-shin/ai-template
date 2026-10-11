import { defineOperation } from "../../core/jsonapi/operation.js";
import { HealthReport } from "./schemas.js";
export const Health_live = defineOperation({
  interface: "Health",
  name: "live",
  method: "GET",
  path: "/health/live",
  tag: "health",
  auth: "none",
  errors: [],
  responses: [{ status: 200, schema: HealthReport, mediaType: "application/json" }],
});
export const Health_ready = defineOperation({
  interface: "Health",
  name: "ready",
  method: "GET",
  path: "/health/ready",
  tag: "health",
  auth: "none",
  errors: [],
  responses: [
    { status: 200, schema: HealthReport, mediaType: "application/json" },
    { status: 503, schema: HealthReport, mediaType: "application/json" },
  ],
});
export const HEALTH_OPERATIONS = [Health_live, Health_ready];
