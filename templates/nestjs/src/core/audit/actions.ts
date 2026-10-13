import { z } from "zod";
import { registerComponent } from "../jsonapi/schemas.js";
export const AUDIT_LOG_ACTIONS = [
  "session.login_succeeded",
  "session.login_failed",
  "session.all_revoked",
  "user.password_changed",
  "user.password_reset",
  "user.roles_changed",
  "user.deactivated",
  "user.reactivated",
  "user.deleted",
  "role.created",
  "role.updated",
  "role.deleted",
  "post.deleted_by_admin",
] as const;
export type AuditLogAction = (typeof AUDIT_LOG_ACTIONS)[number];
export const auditLogActionSchema = registerComponent("AuditLogAction", z.enum(AUDIT_LOG_ACTIONS));
