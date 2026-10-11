import { Module } from "@nestjs/common";
import { SETTINGS, loadSettings } from "./core/config/settings.js";
import { HealthModule } from "./modules/health/index.js";
import { RolesModule } from "./modules/roles/index.js";

@Module({
  imports: [HealthModule, RolesModule],
  providers: [{ provide: SETTINGS, useFactory: () => loadSettings(process.env) }],
})
export class AppModule {}
