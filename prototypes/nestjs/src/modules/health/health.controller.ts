import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get("live")
  live(): { status: "ok"; checks: Record<string, "ok" | "unavailable"> } {
    return { status: "ok", checks: {} };
  }
}
