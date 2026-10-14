import type { Tx } from "../../../core/db/unit-of-work.js";
import type { Locale } from "../../../core/config/locale.js";
import { normalizeEmail } from "../../../core/security/identifier.js";
import { userStatusSchema, type UserStatus } from "../../users/index.js";
import { RolesRepository } from "../../roles/index.js";
import type { OAuthProvider, ProviderIdentity } from "./providers.js";
export async function linkAccount(
  tx: Tx,
  provider: OAuthProvider,
  identity: ProviderIdentity,
  locale: Locale,
): Promise<{ userId: string; status: UserStatus }> {
  const linked = await tx.oAuthAccount.findUnique({
    where: { provider_subject: { provider, subject: identity.subject } },
    include: { user: true },
  });
  if (linked) return { userId: linked.userId, status: userStatusSchema.parse(linked.user.status) };
  const email =
    identity.emailVerified && identity.email !== null ? normalizeEmail(identity.email) : null;
  let user = email === null ? null : await tx.user.findUnique({ where: { email } });
  if (user && user.status !== "active")
    return { userId: user.id, status: userStatusSchema.parse(user.status) };
  if (user && !user.emailVerifiedAt)
    await tx.user.updateMany({
      where: { id: user.id, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date(), passwordHash: null },
    });
  if (!user) {
    user = await tx.user.create({
      data: {
        email,
        emailVerifiedAt: email === null ? null : new Date(),
        passwordHash: null,
        name: identity.name,
        locale,
      },
    });
    await new RolesRepository().assign(tx, user.id, ["member"]);
  }
  await tx.oAuthAccount.create({
    data: { provider, subject: identity.subject, userId: user.id, email },
  });
  return { userId: user.id, status: userStatusSchema.parse(user.status) };
}
