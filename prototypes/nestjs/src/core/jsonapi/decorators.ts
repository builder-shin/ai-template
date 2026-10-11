import {
  applyDecorators,
  createParamDecorator,
  HttpCode,
  RequestMapping,
  RequestMethod,
  SetMetadata,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { CallHandler, CanActivate, ExecutionContext, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { map } from "rxjs";
import { ApiError } from "./errors.js";
import { operationId, MOUNTED_OPERATIONS } from "./operation.js";
import type { OperationDeclaration, PermissionCode } from "./operation.js";
import { parseRequest } from "./validation.js";
import { writeDocument } from "./render.js";
import type { Principal as SecurityPrincipal } from "../security/principal.js";
export interface Principal {
  authentication?: SecurityPrincipal;
  id: string;
  permissions: readonly PermissionCode[];
}
export interface Authenticator {
  authenticate(request: Request): Promise<Principal | null>;
}
export interface JsonApiPorts {
  authenticator: Authenticator;
  globalRateLimit?: (request: Request) => void | Promise<void>;
}
export const OPERATION_METADATA = "jsonapi:operation";
class OperationGuard implements CanActivate {
  constructor(private readonly decl: OperationDeclaration) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (this.decl.auth === "none") return true;
    const ports = req.app.locals.jsonApiPorts as JsonApiPorts;
    const principal = await ports.authenticator.authenticate(req);
    ctx.switchToHttp().getResponse<Response>().locals.principal =
      principal?.authentication ?? principal;
    if (!principal && this.decl.auth === "required")
      throw new ApiError(401, "auth.unauthenticated");
    if (this.decl.permission && !principal?.permissions.includes(this.decl.permission))
      throw new ApiError(403, "permission.denied");
    return true;
  }
}
class DocumentInterceptor implements NestInterceptor {
  constructor(private readonly decl: OperationDeclaration) {}
  intercept(ctx: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((document: unknown) => {
        const response = this.decl.responses[0];
        if (response?.mediaType === "application/json") return document;
        writeDocument(
          ctx.switchToHttp().getResponse<Response>(),
          response?.status ?? 200,
          document,
        );
        return undefined;
      }),
    );
  }
}
export function JsonApiRoute(decl: OperationDeclaration): MethodDecorator {
  MOUNTED_OPERATIONS.set(operationId(decl), decl);
  return applyDecorators(
    RequestMapping({
      path: decl.path.replace(/\{([^}]+)\}/g, ":$1"),
      method: RequestMethod[decl.method],
    }),
    HttpCode(decl.responses[0]?.status ?? 200),
    SetMetadata(OPERATION_METADATA, decl),
    UseGuards(new OperationGuard(decl)),
    UseInterceptors(new DocumentInterceptor(decl)),
  );
}
export const JsonApiRequest = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const decl = Reflect.getMetadata(OPERATION_METADATA, ctx.getHandler()) as OperationDeclaration;
  const req = ctx.switchToHttp().getRequest<Request>();
  return parseRequest(
    decl,
    req.originalUrl,
    req.params as Record<string, string>,
    req.body as unknown,
  );
});

export const JsonApiPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): unknown =>
    ctx.switchToHttp().getResponse<Response>().locals.principal,
);
