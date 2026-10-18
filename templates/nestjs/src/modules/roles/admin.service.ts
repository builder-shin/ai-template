import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import { UnitOfWork, type Tx, type AfterCommit } from "../../core/db/unit-of-work.js";
import { advisoryXactLock } from "../../core/db/locks.js";
import { isUniqueViolation } from "../../core/db/errors.js";
import { recordAudit } from "../../core/audit/record.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { collectionDocument, sparseResource } from "../../core/jsonapi/document.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import type { Principal } from "../../core/security/principal.js";
import { ControlChannel } from "../../core/realtime/control-channel.js";
import { canGrant, publishMeUpdated } from "../users/index.js";
import { RolesRepository } from "./repository.js";
import type { roleCreateAttributesSchema, roleUpdateAttributesSchema } from "./schemas.js";
const protectedRole = () =>
  new ApiError({
    status: 422,
    code: "role.system_role_protected",
    title: "시스템 역할을 보호한다",
  });
@Injectable()
export class RolesAdminService {
  constructor(
    @Inject(UnitOfWork) private readonly unit: UnitOfWork,
    @Inject(RolesRepository) private readonly roles: RolesRepository,
    @Inject(ControlChannel) private readonly control: ControlChannel,
  ) {}
  list(_principal: Principal, query: ParsedQuery, search: string) {
    return this.unit.run(async (tx) => {
      const { rows, total } = await this.roles.list(tx, query);
      return collectionDocument(
        rows.map((r) => sparseResource(this.roles.resource(r), query.fields.roles)),
        { total, page: query.page, path: "/api/v1/roles", search },
      );
    });
  }
  get(_principal: Principal, id: string, query: ParsedQuery) {
    return this.unit.run(async (tx) => ({
      data: sparseResource(this.roles.resource(await this.current(tx, id)), query.fields.roles),
    }));
  }
  create(principal: Principal, input: z.infer<typeof roleCreateAttributesSchema>) {
    if (!canGrant(principal.permissions, new Set(input.permissions)))
      return Promise.reject(
        new ApiError({
          status: 403,
          code: "permission.denied",
          title: "자신에게 없는 권한은 부여할 수 없다",
        }),
      );
    return this.withNameConflict(() =>
      this.unit.run(async (tx) => {
        await advisoryXactLock(tx, "role:admin");
        const role = await this.roles.create(tx, {
          name: input.name,
          permissions: input.permissions,
          ...(input.description === undefined ? {} : { description: input.description }),
        });
        await recordAudit(tx, {
          action: "role.created",
          actorUserId: principal.userId,
          target: { type: "roles", id: role.id },
          meta: { name: role.name, permissions: [...this.roles.permissions(role)].sort() },
        });
        return { data: this.roles.resource(role) };
      }),
    );
  }
  update(principal: Principal, id: string, input: z.infer<typeof roleUpdateAttributesSchema>) {
    return this.withNameConflict(() =>
      this.unit.run(async (tx, afterCommit) => {
        await advisoryXactLock(tx, "role:admin");
        await this.roles.lock(tx, id);
        const role = await this.current(tx, id);
        if (!canGrant(principal.permissions, this.roles.permissions(role)))
          throw new ApiError({
            status: 403,
            code: "permission.denied",
            title: "자신에게 없는 권한을 가진 역할은 고칠 수 없다",
          });
        if (
          role.system &&
          ((input.name !== undefined && input.name !== role.name) ||
            (role.name === "admin" && input.permissions !== undefined))
        )
          throw protectedRole();
        if (
          input.permissions !== undefined &&
          !canGrant(principal.permissions, new Set(input.permissions))
        )
          throw new ApiError({
            status: 403,
            code: "permission.denied",
            title: "자신에게 없는 권한은 부여할 수 없다",
          });
        const permissionsChanged =
          input.permissions !== undefined &&
          (new Set(input.permissions).size !== new Set(role.permissions).size ||
            input.permissions.some((p) => !role.permissions.includes(p)));
        const changed =
          permissionsChanged ||
          (input.name !== undefined && input.name !== role.name) ||
          (input.description !== undefined && input.description !== role.description);
        if (!changed) return { data: this.roles.resource(role) };
        const updated = await this.roles.update(tx, id, {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.permissions === undefined ? {} : { permissions: input.permissions }),
        });
        await recordAudit(tx, {
          action: "role.updated",
          actorUserId: principal.userId,
          target: { type: "roles", id },
        });
        if (permissionsChanged) this.notify(afterCommit, await this.roles.members(tx, id));
        return { data: this.roles.resource(updated) };
      }),
    );
  }
  delete(principal: Principal, id: string): Promise<void> {
    return this.unit.run(async (tx, afterCommit) => {
      await advisoryXactLock(tx, "role:admin");
      await this.roles.lock(tx, id);
      const role = await this.current(tx, id);
      if (role.system) throw protectedRole();
      const members = await this.roles.members(tx, id);
      await this.roles.delete(tx, id);
      await recordAudit(tx, {
        action: "role.deleted",
        actorUserId: principal.userId,
        target: { type: "roles", id },
      });
      this.notify(afterCommit, members);
    });
  }
  private notify(afterCommit: AfterCommit, members: string[]): void {
    for (const userId of new Set(members)) {
      publishMeUpdated(afterCommit, userId, ["roles"]);
      afterCommit(() => this.control.publishRecheck(userId));
    }
  }
  private async current(tx: Tx, id: string) {
    const role = await this.roles.find(tx, id);
    if (!role)
      throw new ApiError({ status: 404, code: "resource.not_found", title: "역할이 없다" });
    return role;
  }
  private async withNameConflict<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (isUniqueViolation(error, "name"))
        throw new ApiError({
          status: 422,
          code: "validation.already_taken",
          title: "이미 사용 중인 역할 이름이다",
          source: { pointer: "/data/attributes/name" },
        });
      throw error;
    }
  }
}
