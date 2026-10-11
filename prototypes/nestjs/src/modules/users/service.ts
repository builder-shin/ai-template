import { Injectable } from "@nestjs/common";
import type { Tx } from "../../core/db/unit-of-work.js";
import { hashPassword } from "../../core/security/passwords.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import { applySparseFields } from "../../core/jsonapi/fields.js";
import { RolesService } from "../roles/index.js";
import { UsersRepository } from "./repository.js";
import type { UserRecord } from "./repository.js";
export function publicUser(user: UserRecord) {
  return {
    type: "users",
    id: user.id,
    attributes: { name: user.name },
    relationships: { avatar: { data: null } },
  };
}
@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly roles: RolesService,
  ) {}
  get(id: string, tx?: Tx) {
    return this.repository.get(id, tx);
  }
  find(email: string, tx?: Tx) {
    return this.repository.find(email, tx);
  }
  async create(
    tx: Tx,
    data: { email: string; password: string; name: string; locale: string; verified?: boolean },
  ) {
    const user = await this.repository.create(tx, {
      email: data.email,
      name: data.name,
      locale: data.locale,
      passwordHash: await hashPassword(data.password),
      ...(data.verified ? { emailVerifiedAt: new Date() } : {}),
    });
    await this.roles.assign(tx, user.id, ["member"]);
    return user;
  }
  verify(tx: Tx, id: string, at: Date) {
    return this.repository.verify(tx, id, at);
  }
  permissions(id: string, tx?: Tx) {
    return this.roles.effectivePermissions(id, tx);
  }
  async me(userId: string, query: ParsedQuery) {
    const user = await this.get(userId);
    if (!user) throw new ApiError(401, "auth.token_invalid");
    const roles = await this.roles.resources(userId);
    return applySparseFields(
      {
        data: {
          type: "users",
          id: user.id,
          attributes: {
            email: user.email,
            name: user.name,
            locale: user.locale,
            status: user.status,
            emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
          },
          relationships: {
            roles: { data: roles.map((r) => ({ type: r.type, id: r.id })) },
            avatar: { data: null },
          },
        },
        ...(query.include.includes("roles") ? { included: roles } : {}),
        meta: { permissions: [...(await this.permissions(userId))].sort() },
      },
      query.fields,
    );
  }
}
