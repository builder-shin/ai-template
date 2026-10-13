import type { Tx } from "../../core/db/unit-of-work.js";
import { PERMISSION_CODES, type PermissionCode } from "../../core/security/permissions.js";
import { Injectable } from "@nestjs/common";
import { resourceObject, type ResourceObject } from "../../core/jsonapi/document.js";
import { SYSTEM_ROLES } from "./permissions.js";
@Injectable()
export class RolesRepository {
  async permissionsOf(tx: Tx, userId: string): Promise<Set<PermissionCode>> {
    const assignments = await tx.userRole.findMany({ where: { userId }, include: { role: true } });
    if (assignments.some(({ role }) => role.name === "admin" && role.system))
      return new Set(PERMISSION_CODES);
    return new Set(
      assignments
        .flatMap(({ role }) => role.permissions)
        .filter((code): code is PermissionCode => PERMISSION_CODES.some((known) => known === code)),
    );
  }
  async assign(tx: Tx, userId: string, roleNames: readonly string[]): Promise<void> {
    const names = [...new Set(roleNames)];
    if (!names.length) return;
    const roles = await tx.role.findMany({ where: { name: { in: names } } });
    if (roles.length !== names.length) throw new Error("요청한 역할이 없다");
    await tx.userRole.createMany({
      data: roles.map((role) => ({ userId, roleId: role.id })),
      skipDuplicates: true,
    });
  }
  async seedRoles(tx: Tx): Promise<void> {
    for (const role of SYSTEM_ROLES) {
      const data = { ...role, permissions: [...role.permissions], system: true };
      await tx.role.upsert({ where: { name: role.name }, create: data, update: {} });
    }
  }
  async seedAdmin(tx: Tx, email: string, passwordHash: string): Promise<string> {
    const user = await tx.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash,
        emailVerifiedAt: new Date(),
        name: "Admin",
        locale: "ko",
        status: "active",
      },
    });
    return user.id;
  }
  async load(tx: Tx, ids: readonly string[]): Promise<readonly ResourceObject[]> {
    const roles = await tx.role.findMany({ where: { id: { in: [...ids] } } });
    return roles.map((role) =>
      resourceObject("roles", role.id, {
        name: role.name,
        description: role.description,
        permissions:
          role.system && role.name === "admin"
            ? [...PERMISSION_CODES]
            : role.permissions.filter((code) => PERMISSION_CODES.some((known) => known === code)),
        isSystem: role.system,
      }),
    );
  }
}
