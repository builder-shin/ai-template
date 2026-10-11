import { JsonApiRoute } from "../../core/jsonapi/decorators.js";
import { Health_live } from "./operations.js";
import { Controller } from "@nestjs/common";

@Controller()
export class HealthController {
  @JsonApiRoute(Health_live)
  live(): { status: "ok"; checks: Record<string, "ok" | "unavailable"> } {
    return { status: "ok", checks: {} };
  }
}
