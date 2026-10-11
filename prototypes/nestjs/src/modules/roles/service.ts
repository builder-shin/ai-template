import { Injectable } from "@nestjs/common";
import type { Tx } from "../../core/db/unit-of-work.js";
import { RolesRepository } from "./repository.js";
import { PermissionRegistry } from "./permissions.js";
import type { PermissionCode } from "./permissions.js";
@Injectable()
export class RolesService {
  constructor(
    private readonly repository: RolesRepository,
    private readonly registry: PermissionRegistry,
  ) {}
  async effectivePermissions(userId: string, tx?: Tx): Promise<ReadonlySet<PermissionCode>> {
    const permissions = new Set<PermissionCode>();
    for (const role of await this.repository.ofUser(userId, tx)) {
      const codes =
        role.isSystem && role.name === "admin"
          ? this.registry.list().map((p) => p.code)
          : role.permissions;
      for (const code of codes) if (this.registry.has(code)) permissions.add(code);
    }
    return permissions;
  }
  async resources(userId: string) {
    return (await this.repository.ofUser(userId)).map((role) => ({
      type: "roles",
      id: role.id,
      attributes: {
        name: role.name,
        description: role.description,
        permissions: (role.isSystem && role.name === "admin"
          ? this.registry.list().map((p) => p.code)
          : role.permissions.filter((p) => this.registry.has(p))
        ).sort(),
        isSystem: role.isSystem,
        createdAt: role.createdAt.toISOString(),
        updatedAt: role.updatedAt.toISOString(),
      },
    }));
  }
  assign(tx: Tx, userId: string, names: readonly string[]) {
    return this.repository.assign(tx, userId, names);
  }
  seed(tx: Tx) {
    return this.repository.seed(tx);
  }
}
