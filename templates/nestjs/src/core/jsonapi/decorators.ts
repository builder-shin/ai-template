import {
  createParamDecorator,
  Delete,
  Get,
  Patch,
  Post,
  SetMetadata,
  applyDecorators,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import type { Principal } from "../security/principal.js";
import type { OperationDeclaration } from "./operation.js";
import { validateRequest } from "./validation.js";
export const OPERATION_METADATA = Symbol("operation");
export function Operation(declaration: OperationDeclaration): MethodDecorator {
  const path = declaration.path.replace(/\{([^}]+)\}/g, ":$1");
  const route = { GET: Get, POST: Post, PATCH: Patch, DELETE: Delete }[declaration.method];
  return applyDecorators(route(path), SetMetadata(OPERATION_METADATA, declaration));
}
export const JsonApiRequest: () => ParameterDecorator = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const declaration = Reflect.getMetadata(OPERATION_METADATA, context.getHandler()) as
      OperationDeclaration | undefined;
    if (!declaration) throw new Error("처리기에 Operation 선언이 없다");
    const req = context.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const index = req.originalUrl.indexOf("?");
    const validated = validateRequest(declaration, {
      search: index < 0 ? "" : req.originalUrl.slice(index + 1),
      params: req.params as Record<string, string>,
      body: req.body as unknown,
    });
    return { ...validated, principal: req.principal };
  },
);
