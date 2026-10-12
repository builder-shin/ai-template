import type { PermissionCode } from "../jsonapi/operation.js";
export interface Principal {
  userId: string;
  sessionId: string;
  permissions: ReadonlySet<PermissionCode>;
  sessionCreatedAt: Date;
}
