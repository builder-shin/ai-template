import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SpanStatusCode } from "@opentelemetry/api";
import { Observable } from "rxjs";
import { OPERATION_METADATA } from "../jsonapi/decorators.js";
import type { OperationDeclaration } from "../jsonapi/operation.js";
import { getTracer, ignoreIncoming } from "../telemetry/tracer.js";
export class OperationInterceptor implements NestInterceptor {
  constructor(private readonly reflector = new Reflector()) {}
  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const operation = this.reflector.get<OperationDeclaration | undefined>(
      OPERATION_METADATA,
      context.getHandler(),
    );
    if (!operation?.path || ignoreIncoming({ url: operation.path })) return next.handle();
    return new Observable((subscriber) =>
      getTracer().startActiveSpan(
        `${operation.method} ${operation.path}`,
        {
          attributes: { "http.route": operation.path, "aitpl.operation_id": operation.operationId },
        },
        (span) => {
          try {
            const subscription = next.handle().subscribe({
              next: (value: unknown) => {
                subscriber.next(value);
              },
              error: (error: unknown) => {
                span.setStatus({ code: SpanStatusCode.ERROR });
                subscriber.error(error);
              },
              complete: () => {
                subscriber.complete();
              },
            });
            return () => {
              subscription.unsubscribe();
              span.end();
            };
          } catch (error) {
            span.setStatus({ code: SpanStatusCode.ERROR });
            span.end();
            throw error;
          }
        },
      ),
    );
  }
}
