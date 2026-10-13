import type { Tx } from "../../../core/db/unit-of-work.js";

interface RoleRow {
  id: string;
  name: string;
  system: boolean;
  permissions: string[];
  description: string | null;
}
interface UserRow {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  locale: string;
  status: string;
  emailVerifiedAt: Date | null;
  avatarFileId: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
type RoleData = Omit<RoleRow, "id">;
type UserData = Pick<UserRow, "email" | "passwordHash"> & Partial<UserRow>;
export function databaseFixture() {
  const roles: RoleRow[] = [],
    users: UserRow[] = [],
    assignments: { userId: string; roleId: string }[] = [],
    audits: Record<string, unknown>[] = [];
  const role = {
    findMany: ({
      where,
    }: { where?: { name?: { in: readonly string[] }; id?: { in: readonly string[] } } } = {}) =>
      Promise.resolve(
        roles.filter(
          (r) =>
            (!where?.name || where.name.in.includes(r.name)) &&
            (!where?.id || where.id.in.includes(r.id)),
        ),
      ),
    upsert: ({
      where,
      create,
      update,
    }: {
      where: { name: string };
      create: RoleData;
      update: Partial<RoleData>;
    }) => {
      let row = roles.find((r) => r.name === where.name);
      if (row) Object.assign(row, update);
      else {
        row = { id: `r${String(roles.length + 1)}`, ...create };
        roles.push(row);
      }
      return Promise.resolve(row);
    },
  };
  const user = {
    findUnique: ({ where }: { where: { email: string } }) =>
      Promise.resolve(users.find((u) => u.email === where.email) ?? null),
    upsert: ({
      where,
      create,
      update,
    }: {
      where: { email: string };
      create: UserData;
      update: Partial<UserData>;
    }) => {
      let row = users.find((u) => u.email === where.email);
      if (row) Object.assign(row, update);
      else {
        row = {
          id: `u${String(users.length + 1)}`,
          name: null,
          locale: "ko",
          status: "active",
          emailVerifiedAt: null,
          avatarFileId: null,
          lastLoginAt: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
          ...create,
        };
        users.push(row);
      }
      return Promise.resolve(row);
    },
  };
  const userRole = {
    findMany: ({ where }: { where: { userId: string } }) =>
      Promise.resolve(
        assignments
          .filter((a) => a.userId === where.userId)
          .map((a) => ({ ...a, role: roles.find((r) => r.id === a.roleId) })),
      ),
    createMany: ({
      data,
      skipDuplicates,
    }: {
      data: readonly { userId: string; roleId: string }[];
      skipDuplicates?: boolean;
    }) => {
      let count = 0;
      for (const item of data) {
        if (!users.some((u) => u.id === item.userId) || !roles.some((r) => r.id === item.roleId))
          throw new Error("외래 키가 없다");
        if (assignments.some((a) => a.userId === item.userId && a.roleId === item.roleId)) {
          if (!skipDuplicates) throw new Error("역할이 중복된다");
          continue;
        }
        assignments.push({ ...item });
        count++;
      }
      return Promise.resolve({ count });
    },
  };
  const auditLog = {
    create: ({ data }: { data: Record<string, unknown> }) => {
      audits.push(data);
      return Promise.resolve(data);
    },
  };
  return {
    tx: { role, user, userRole, auditLog } as unknown as Tx,
    roles,
    users,
    assignments,
    audits,
  };
}
export function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error("필수 fixture가 없다");
  return value;
}
