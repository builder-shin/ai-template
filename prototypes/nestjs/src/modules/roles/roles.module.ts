import { RolesRepository } from "./repository.js";
import { RolesService } from "./service.js";
import { PermissionsController } from "./permissions.controller.js";
import { PermissionService } from "./permissions.service.js";
import { Module } from "@nestjs/common";
import { PermissionRegistry } from "./permissions.js";

@Module({
  providers: [PermissionRegistry, PermissionService, RolesRepository, RolesService],
  controllers: [PermissionsController],
  exports: [PermissionRegistry, RolesService],
})
export class RolesModule {}
