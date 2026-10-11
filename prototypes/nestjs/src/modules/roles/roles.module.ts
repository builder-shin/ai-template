import { PermissionsController } from "./permissions.controller.js";
import { PermissionService } from "./permissions.service.js";
import { Module } from "@nestjs/common";
import { PermissionRegistry } from "./permissions.js";

@Module({
  providers: [PermissionRegistry, PermissionService],
  controllers: [PermissionsController],
  exports: [PermissionRegistry],
})
export class RolesModule {}
