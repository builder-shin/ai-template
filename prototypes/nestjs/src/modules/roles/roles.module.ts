import { Module } from "@nestjs/common";
import { PermissionRegistry } from "./permissions.js";

@Module({ providers: [PermissionRegistry], exports: [PermissionRegistry] })
export class RolesModule {}
