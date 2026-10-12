import { Module } from "@nestjs/common";
import { HealthService } from "./service.js";
import { HealthController } from "./health.controller.js";

@Module({ controllers: [HealthController], providers: [HealthService] })
export class HealthModule {}
