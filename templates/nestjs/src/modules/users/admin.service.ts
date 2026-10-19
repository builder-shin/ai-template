import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { UnitOfWork, type Tx } from "../../core/db/unit-of-work.js";
import { advisoryXactLock } from "../../core/db/locks.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { IncludeRegistry } from "../../core/jsonapi/include.js";
import {
  collectionDocument,
  sparseResource,
  type ResourceObject,
} from "../../core/jsonapi/document.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import type { Principal } from "../../core/security/principal.js";
import { ControlChannel } from "../../core/realtime/control-channel.js";
import { recordAudit } from "../../core/audit/record.js";
import { RolesRepository } from "../roles/index.js";
import { SessionsService } from "../auth/index.js";
import { UsersRepository, type UserRecord } from "./repository.js";
import { assertNotLastActiveAdmin } from "./anonymize.js";
import { publishMeUpdated } from "./events.js";
import { canGrant } from "./escalation.js";
import type { userUpdateDocumentSchema } from "./schemas.js";
type Update = Pick<
  z.infer<typeof userUpdateDocumentSchema>["data"],
  "attributes" | "relationships"
>;
const notFound = () =>
  new ApiError({ status: 404, code: "resource.not_found", title: "사용자가 없다" });
@Injectable()
export class UsersAdminService {
  constructor(
    @Inject(UnitOfWork) private readonly unit: UnitOfWork,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(RolesRepository) private readonly roles: RolesRepository,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(ControlChannel) private readonly control: ControlChannel,
    @Inject(IncludeRegistry) private readonly includes: IncludeRegistry,
  ) {}
  list(principal: Principal, query: ParsedQuery, search: string) {
    return this.unit.run(async (tx) => {
      const { rows, total } = await this.users.list(tx, query);
      const primary = rows.map((u) => this.users.resource(u));
      const included = await this.included(tx, principal, primary, query);
      return collectionDocument(
        primary.map((r) => sparseResource(r, query.fields.users)),
        {
          total,
          page: query.page,
          path: "/api/v1/users",
          search,
          ...(included === undefined ? {} : { included }),
        },
      );
    });
  }
  get(principal: Principal, id: string, query: ParsedQuery) {
    return this.unit.run(async (tx) => {
      const data = this.users.resource(await this.current(tx, id));
      const included = await this.included(tx, principal, [data], query);
      return {
        data: sparseResource(data, query.fields.users),
        ...(included === undefined ? {} : { included }),
      };
    });
  }
  update(principal: Principal, id: string, input: Update) {
    return this.unit.run(async (tx, afterCommit) => {
      // 관리 변경과 탈퇴의 잠금 순서를 맞추고 마지막 admin 판정을 직렬화한다.
      await advisoryXactLock(tx, "role:admin");
      await this.users.lock(tx, id);
      const user = await this.current(tx, id);
      const status = input.attributes?.status;
      if (user.status === "deleted")
        throw new ApiError({
          status: 409,
          code: "resource.conflict",
          title: "탈퇴한 사용자는 관리 작업으로 바꿀 수 없다",
        });
      if (status === "deleted")
        throw new ApiError({
          status: 422,
          code: "validation.invalid_choice",
          title: "탈퇴 상태는 관리 작업으로 바꿀 수 없다",
          source: { pointer: "/data/attributes/status" },
        });
      if (
        principal.userId === id ||
        !canGrant(principal.permissions, await this.roles.permissionsOf(tx, id))
      )
        throw new ApiError({
          status: 403,
          code: "permission.denied",
          title: "자신이나 자신에게 없는 권한을 가진 사용자는 고칠 수 없다",
        });
      const requested = input.relationships?.roles;
      const ids =
        requested === undefined ? undefined : [...new Set(requested.data.map((r) => r.id))];
      const roles =
        ids === undefined
          ? undefined
          : await this.roles.findIds(
              tx,
              ids.filter((roleId) => z.regexes.uuid().test(roleId)),
            );
      for (const [index, reference] of requested?.data.entries() ?? [])
        if (!roles?.some((role) => role.id === reference.id))
          throw new ApiError({
            status: 404,
            code: "resource.not_found",
            title: "지정한 역할이 없다",
            source: { pointer: `/data/relationships/roles/data/${String(index)}` },
          });
      if (roles?.some((r) => !canGrant(principal.permissions, this.roles.permissions(r))))
        throw new ApiError({
          status: 403,
          code: "permission.denied",
          title: "자신에게 없는 권한은 부여할 수 없다",
        });
      const rolesChanged =
        ids !== undefined &&
        (ids.length !== user.roles.length ||
          ids.some((roleId) => !user.roles.some((r) => r.roleId === roleId)));
      const statusChanged = status !== undefined && status !== user.status;
      const removesAdmin = rolesChanged && !roles?.some((r) => r.system && r.name === "admin");
      if (removesAdmin || (statusChanged && status === "deactivated"))
        await assertNotLastActiveAdmin(tx, id);
      const changed: ("roles" | "status")[] = [];
      if (rolesChanged && roles) {
        await this.roles.replaceRoles(
          tx,
          id,
          roles.map((r) => r.name),
        );
        await recordAudit(tx, {
          action: "user.roles_changed",
          actorUserId: principal.userId,
          target: { type: "users", id },
          meta: {
            added: roles
              .filter((r) => !user.roles.some((held) => held.roleId === r.id))
              .map((r) => r.name)
              .sort(),
            removed: (
              await this.roles.findIds(
                tx,
                user.roles.filter((held) => !ids.includes(held.roleId)).map((held) => held.roleId),
              )
            )
              .map((r) => r.name)
              .sort(),
          },
        });
        changed.push("roles");
      }
      if (statusChanged) {
        await this.users.updateStatus(tx, id, status);
        if (status === "deactivated")
          await this.sessions.revokeForDeactivation(tx, afterCommit, id, new Date());
        await recordAudit(tx, {
          action: status === "active" ? "user.reactivated" : "user.deactivated",
          actorUserId: principal.userId,
          target: { type: "users", id },
        });
        changed.push("status");
      }
      publishMeUpdated(afterCommit, id, changed);
      if (changed.length) afterCommit(() => this.control.publishRecheck(id));
      return { data: this.users.resource(await this.current(tx, id)) };
    });
  }
  private async current(tx: Tx, id: string): Promise<UserRecord> {
    const user = await this.users.find(tx, id);
    if (!user) throw notFound();
    return user;
  }
  private async included(
    tx: Tx,
    principal: Principal,
    primary: ResourceObject[],
    query: ParsedQuery,
  ) {
    if (!query.include.length) return undefined;
    return (await this.includes.load(tx, query.include, primary, principal)).map((r) =>
      sparseResource(r, query.fields[r.type]),
    );
  }
}
