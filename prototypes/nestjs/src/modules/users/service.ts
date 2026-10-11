import { Injectable } from "@nestjs/common";
import type { Tx } from "../../core/db/unit-of-work.js";
import { hashPassword } from "../../core/security/passwords.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import { applySparseFields } from "../../core/jsonapi/fields.js";
import { RolesService } from "../roles/index.js";
import { UsersRepository } from "./repository.js";
import type { UserRecord } from "./repository.js";
import type { Identified } from "../../core/jsonapi/include.js";
export function publicUser(user: UserRecord) {
  return {
    type: "users",
    id: user.id,
    attributes: { name: user.name },
    relationships: {
      avatar: { data: user.avatarId ? { type: "files", id: user.avatarId } : null },
    },
  };
}
@Injectable()
export class UsersService {
  private avatarLoader: (ids: readonly string[]) => Promise<Identified[]> = () =>
    Promise.resolve([]);
  setAvatarLoader(loader: (ids: readonly string[]) => Promise<Identified[]>): void {
    this.avatarLoader = loader;
  }
  constructor(
    private readonly repository: UsersRepository,
    private readonly roles: RolesService,
  ) {}
  get(id: string, tx?: Tx) {
    return this.repository.get(id, tx);
  }
  many(ids: readonly string[], tx?: Tx) {
    return this.repository.many(ids, tx);
  }
  avatarReferences(tx: Tx, ids: readonly string[]) {
    return this.repository.avatarReferences(tx, ids);
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
    const included: Identified[] = query.include.includes("roles") ? [...roles] : [];
    if (query.include.includes("avatar") && user.avatarId)
      included.push(...(await this.avatarLoader([user.avatarId])));
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
            avatar: { data: user.avatarId ? { type: "files", id: user.avatarId } : null },
          },
        },
        ...(query.include.length ? { included } : {}),
        meta: { permissions: [...(await this.permissions(userId))].sort() },
      },
      query.fields,
    );
  }
}
