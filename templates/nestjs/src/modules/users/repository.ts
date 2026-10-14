import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { Tx } from "../../core/db/unit-of-work.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { resourceObject } from "../../core/jsonapi/document.js";
export type UserRecord = Prisma.UserGetPayload<{ include: { roles: true } }>;
@Injectable()
export class UsersRepository {
  findByEmail(tx: Tx, email: string) {
    return tx.user.findUnique({ where: { email } });
  }
  find(tx: Tx, id: string): Promise<UserRecord | null> {
    return tx.user.findUnique({ where: { id }, include: { roles: true } });
  }
  async lock(tx: Tx, id: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
  }
  async updateProfile(
    tx: Tx,
    id: string,
    data: { name?: string; locale?: "ko" | "en"; avatarFileId?: string | null },
  ): Promise<void> {
    await tx.user.update({ where: { id }, data });
  }
  async assertAvatar(tx: Tx, userId: string, id: string): Promise<void> {
    const file = z.regexes.uuid().test(id) ? await tx.file.findUnique({ where: { id } }) : null;
    const source = { pointer: "/data/relationships/avatar/data" };
    if (!file || file.ownerId !== userId)
      throw new ApiError({
        status: 404,
        code: "resource.not_found",
        title: "아바타 파일이 없다",
        source,
      });
    if (file.status !== "ready")
      throw new ApiError({
        status: 422,
        code: "file.upload_incomplete",
        title: "아바타 업로드가 끝나지 않았다",
        source,
      });
  }
  async attachAvatar(tx: Tx, id: string): Promise<void> {
    await tx.file.update({ where: { id }, data: { detachedAt: null } });
  }
  resource(user: UserRecord) {
    return resourceObject(
      "users",
      user.id,
      {
        email: user.email,
        name: user.name,
        locale: user.locale,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      {
        roles: { data: user.roles.map((role) => ({ type: "roles", id: role.roleId })) },
        avatar: { data: user.avatarFileId ? { type: "files", id: user.avatarFileId } : null },
      },
    );
  }
  async load(tx: Tx, ids: readonly string[]) {
    const users = await tx.user.findMany({ where: { id: { in: [...ids] } } });
    return users.map((user) =>
      resourceObject(
        "users",
        user.id,
        { name: user.status === "deleted" ? null : user.name },
        { avatar: { data: user.avatarFileId ? { type: "files", id: user.avatarFileId } : null } },
      ),
    );
  }
  async publicAvatarIds(tx: Tx, ids: readonly string[]): Promise<ReadonlySet<string>> {
    const users = await tx.user.findMany({
      where: { avatarFileId: { in: [...ids] } },
      select: { avatarFileId: true },
    });
    return new Set(users.flatMap((user) => (user.avatarFileId ? [user.avatarFileId] : [])));
  }
}
