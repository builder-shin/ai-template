import type { PermissionCode } from "./permissions.js";
export interface Principal {
  readonly userId: string;
  readonly sessionId: string;
  readonly permissions: ReadonlySet<PermissionCode>;
}
