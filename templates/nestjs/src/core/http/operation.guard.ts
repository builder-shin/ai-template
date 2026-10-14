import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { OPERATION_METADATA } from "../jsonapi/decorators.js";
import type { OperationDeclaration } from "../jsonapi/operation.js";
import { ApiError } from "../jsonapi/errors.js";
import {
  PRINCIPAL_RESOLVER,
  type Principal,
  type PrincipalResolver,
} from "../security/principal.js";

@Injectable()
export class OperationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PRINCIPAL_RESOLVER) private readonly resolver: PrincipalResolver,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() === "ws") return true;
    const operation = this.reflector.get<OperationDeclaration | undefined>(
      OPERATION_METADATA,
      context.getHandler(),
    );
    if (!operation) throw new Error("처리기에 Operation 선언이 없다");
    if (operation.auth === "none") return true;
    const req = context.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const authorization = req.headers.authorization;
    if (authorization === undefined && operation.auth === "required") this.unauthenticated();
    const principal =
      authorization === undefined ? undefined : await this.resolver.resolve(authorization);
    if (!principal && operation.auth === "required") this.unauthenticated();
    if (principal) req.principal = principal;
    else delete req.principal;
    if (operation.permission && !principal?.permissions.has(operation.permission))
      throw new ApiError({ status: 403, code: "permission.denied", title: "Forbidden" });
    return true;
  }
  private unauthenticated(): never {
    throw new ApiError({
      status: 401,
      code: "auth.unauthenticated",
      title: "Unauthorized",
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }
}
