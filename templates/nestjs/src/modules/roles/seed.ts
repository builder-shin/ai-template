import type { Tx } from "../../core/db/unit-of-work.js";
import type { Settings } from "../../core/config/settings.js";
import { normalizeEmail } from "../../core/security/identifier.js";
import { hashPassword } from "../../core/security/passwords.js";
import { RolesRepository } from "./repository.js";
export async function seedSystem(tx: Tx, settings: Settings): Promise<{ adminUserId: string }> {
  const repository = new RolesRepository();
  await repository.seedRoles(tx);
  const adminUserId = await repository.seedAdmin(
    tx,
    normalizeEmail(settings.SEED_ADMIN_EMAIL),
    await hashPassword(settings.SEED_ADMIN_PASSWORD),
  );
  await repository.assign(tx, adminUserId, ["admin", "member"]);
  return { adminUserId };
}
