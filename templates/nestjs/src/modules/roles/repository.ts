import type { Tx } from "../../core/db/unit-of-work.js";
import { PERMISSION_CODES, type PermissionCode } from "../../core/security/permissions.js";
import { Injectable } from "@nestjs/common";
import { resourceObject, type ResourceObject } from "../../core/jsonapi/document.js";
import { SYSTEM_ROLES } from "./permissions.js";
import { rolePermissions } from "./permissions.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import type { Prisma, Role } from "../../generated/prisma/client.js";
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
  permissions(role: Role): Set<PermissionCode> {
    return new Set(rolePermissions(role));
  }
  async lock(tx: Tx, id: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM roles WHERE id = ${id}::uuid FOR UPDATE`;
  }
  find(tx: Tx, id: string) {
    return tx.role.findUnique({ where: { id } });
  }
  findIds(tx: Tx, ids: readonly string[]) {
    return tx.role.findMany({ where: { id: { in: [...ids] } } });
  }
  async list(tx: Tx, query: ParsedQuery) {
    const where: Prisma.RoleWhereInput =
      typeof query.filter.q === "string"
        ? { name: { contains: query.filter.q, mode: "insensitive" } }
        : {};
    const total = await tx.role.count({ where });
    const rows = await tx.role.findMany({
      where,
      orderBy: [
        ...query.sort.map((s) => ({
          [s.field]: s.descending ? ("desc" as const) : ("asc" as const),
        })),
        { id: "asc" },
      ],
      skip: (query.page.number - 1) * query.page.size,
      take: query.page.size,
    });
    return { total, rows };
  }
  create(
    tx: Tx,
    data: { name: string; description?: string | null; permissions: readonly PermissionCode[] },
  ) {
    return tx.role.create({ data: { ...data, permissions: [...new Set(data.permissions)] } });
  }
  update(
    tx: Tx,
    id: string,
    data: { name?: string; description?: string | null; permissions?: readonly PermissionCode[] },
  ) {
    return tx.role.update({
      where: { id },
      data: {
        ...(data.name === undefined ? {} : { name: data.name }),
        ...(data.description === undefined ? {} : { description: data.description }),
        ...(data.permissions === undefined ? {} : { permissions: [...new Set(data.permissions)] }),
      },
    });
  }
  async members(tx: Tx, roleId: string): Promise<string[]> {
    return (await tx.userRole.findMany({ where: { roleId } })).map((a) => a.userId);
  }
  async delete(tx: Tx, id: string): Promise<void> {
    await tx.userRole.deleteMany({ where: { roleId: id } });
    await tx.role.delete({ where: { id } });
  }
  async replaceRoles(tx: Tx, userId: string, names: readonly string[]): Promise<void> {
    const roles = await tx.role.findMany({ where: { name: { in: [...new Set(names)] } } });
    if (roles.length !== new Set(names).size) throw new Error("교체할 역할이 없다");
    await tx.userRole.deleteMany({ where: { userId } });
    if (roles.length)
      await tx.userRole.createMany({
        data: roles.map((r) => ({ userId, roleId: r.id })),
        skipDuplicates: true,
      });
  }
  resource(role: Role): ResourceObject {
    return resourceObject("roles", role.id, {
      name: role.name,
      description: role.description,
      permissions: rolePermissions(role),
      isSystem: role.system,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    });
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
    return roles.map((role) => this.resource(role));
  }
}
