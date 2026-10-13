import type { PermissionCode } from "./permissions.js";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../jsonapi/errors.js";
export interface Principal {
  readonly userId: string;
  readonly sessionId: string;
  readonly permissions: ReadonlySet<PermissionCode>;
}
export const PRINCIPAL_RESOLVER: unique symbol = Symbol("PRINCIPAL_RESOLVER");
export interface PrincipalResolver {
  resolve(authorization: string | undefined): Promise<Principal | undefined>;
}
@Injectable()
export class UnavailablePrincipalResolver implements PrincipalResolver {
  resolve(authorization: string | undefined): Promise<Principal | undefined> {
    if (authorization === undefined) return Promise.resolve(undefined);
    return Promise.reject(
      new ApiError({
        status: 401,
        code: "auth.token_invalid",
        title: "Invalid token",
        headers: { "WWW-Authenticate": "Bearer" },
      }),
    );
  }
}
