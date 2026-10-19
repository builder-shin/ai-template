import { Inject, Injectable } from "@nestjs/common";
import { UnitOfWork, type Tx } from "../../core/db/unit-of-work.js";
import { SETTINGS, type Settings } from "../../core/config/settings.js";
import type { Principal } from "../../core/security/principal.js";
import { tokenError } from "../../core/security/jwt.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import { IncludeRegistry } from "../../core/jsonapi/include.js";
import { sparseResource } from "../../core/jsonapi/document.js";
import { recordAudit } from "../../core/audit/record.js";
import { UsersRepository, type UserRecord } from "./repository.js";
import { RolesRepository } from "../roles/index.js";
import { FilesService } from "../files/index.js";
import { SessionsService } from "../auth/index.js";
import { anonymizeUser, assertNotLastActiveAdmin } from "./anonymize.js";
import { publishMeUpdated } from "./events.js";
export interface MeUpdate {
  id: string;
  attributes?: { name?: string | undefined; locale?: "ko" | "en" | undefined } | undefined;
  relationships?:
    { avatar?: { data: { type: "files"; id: string } | null } | undefined } | undefined;
}
@Injectable()
export class MeService {
  constructor(
    @Inject(UnitOfWork) private readonly unit: UnitOfWork,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(RolesRepository) private readonly roles: RolesRepository,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(SETTINGS) private readonly settings: Settings,
    @Inject(IncludeRegistry) private readonly includes: IncludeRegistry,
  ) {}
  get(principal: Principal, query?: ParsedQuery) {
    return this.unit.run(async (tx) =>
      this.document(tx, principal, await this.current(tx, principal), query),
    );
  }
  async update(principal: Principal, input: MeUpdate) {
    if (input.id !== principal.userId)
      throw new ApiError({
        status: 409,
        code: "resource.conflict",
        title: "본문 id가 본인과 다르다",
        source: { pointer: "/data/id" },
      });
    return this.unit.run(async (tx, afterCommit) => {
      await this.users.lock(tx, principal.userId);
      const user = await this.current(tx, principal);
      const attributes = input.attributes ?? {};
      const avatar = input.relationships?.avatar;
      const avatarId = avatar === undefined ? user.avatarFileId : (avatar.data?.id ?? null);
      if (avatarId !== null && avatar !== undefined)
        await this.users.assertAvatar(tx, principal.userId, avatarId);
      const changed =
        (attributes.name !== undefined && attributes.name !== user.name) ||
        (attributes.locale !== undefined && attributes.locale !== user.locale) ||
        avatarId !== user.avatarFileId;
      if (changed) {
        if (avatarId !== user.avatarFileId) {
          if (user.avatarFileId) await this.files.detach(tx, [user.avatarFileId]);
          if (avatarId) await this.users.attachAvatar(tx, avatarId);
        }
        await this.users.updateProfile(tx, user.id, {
          ...(attributes.name === undefined ? {} : { name: attributes.name }),
          ...(attributes.locale === undefined ? {} : { locale: attributes.locale }),
          ...(avatar === undefined ? {} : { avatarFileId: avatarId }),
        });
        publishMeUpdated(afterCommit, user.id, ["profile"]);
      }
      return this.document(tx, principal, await this.current(tx, principal));
    });
  }
  delete(principal: Principal): Promise<void> {
    return this.unit.run(async (tx, afterCommit) => {
      // 관리 역할 변경과 같은 순서로 보호 잠금을 얻고 사용자 행을 잠근다.
      const session = await tx.session.findUnique({ where: { id: principal.sessionId } });
      const at = new Date();
      if (
        !session ||
        session.userId !== principal.userId ||
        session.revokedAt ||
        session.expiresAt <= at
      )
        throw tokenError();
      if (
        at.getTime() - session.authenticatedAt.getTime() >
        this.settings.RECENT_LOGIN_SECONDS * 1000
      )
        throw new ApiError({
          status: 401,
          code: "auth.reauthentication_required",
          title: "다시 로그인해야 한다",
          headers: {
            "WWW-Authenticate": `Bearer error="insufficient_user_authentication", max_age=${String(this.settings.RECENT_LOGIN_SECONDS)}`,
          },
        });
      await assertNotLastActiveAdmin(tx, principal.userId);
      await this.users.lock(tx, principal.userId);
      const user = await this.current(tx, principal);
      await this.sessions.revokeForAccountDeletion(tx, afterCommit, user.id, at);
      if (user.avatarFileId) await this.files.detach(tx, [user.avatarFileId]);
      await anonymizeUser(tx, user.id);
      await recordAudit(tx, {
        action: "user.deleted",
        actorUserId: user.id,
        target: { type: "users", id: user.id },
      });
    });
  }
  private async current(tx: Tx, principal: Principal): Promise<UserRecord> {
    const user = await this.users.find(tx, principal.userId);
    if (!user || user.status !== "active") throw tokenError();
    return user;
  }
  private async document(tx: Tx, principal: Principal, user: UserRecord, query?: ParsedQuery) {
    const data = this.users.resource(user);
    const included = query?.include.length
      ? await this.includes.load(tx, query.include, [data], principal)
      : undefined;
    return {
      data: sparseResource(data, query?.fields.users),
      ...(included === undefined
        ? {}
        : { included: included.map((item) => sparseResource(item, query?.fields[item.type])) }),
      meta: { permissions: [...(await this.roles.permissionsOf(tx, user.id))].sort() },
    };
  }
}
