import { Controller, Inject, Injectable } from "@nestjs/common";
import type { CanActivate, CallHandler, NestInterceptor, PipeTransform } from "@nestjs/common";
import { WebSocketGateway } from "@nestjs/websockets";
import { Dependency } from "./dependency.js";
import { PublicDependency } from "./public/index.js";

export const TOKEN = Symbol("probe-token");
export interface TokenValue {
  label: string;
}

@Injectable()
export class Consumer {
  constructor(
    readonly dependency: Dependency,
    readonly publicDependency: PublicDependency,
  ) {}
  read(): string {
    return `${this.dependency.read()}:${this.publicDependency.read()}`;
  }
}

@Injectable()
export class TokenConsumer {
  constructor(@Inject(TOKEN) readonly value: TokenValue) {}
}

@Injectable()
export class ProbeGuard implements CanActivate {
  constructor(readonly dependency: Dependency) {}
  canActivate(): boolean {
    return this.dependency.read() === "cross-file";
  }
}

@Injectable()
export class ProbePipe implements PipeTransform<string, string> {
  constructor(readonly dependency: Dependency) {}
  transform(value: string): string {
    return `${value}:${this.dependency.read()}`;
  }
}

@Injectable()
export class ProbeInterceptor implements NestInterceptor {
  constructor(readonly dependency: Dependency) {}
  intercept(_context: unknown, next: CallHandler) {
    return next.handle();
  }
}

@WebSocketGateway()
export class ProbeGateway {
  constructor(readonly dependency: Dependency) {}
}

@Controller("probe")
export class ProbeController {
  constructor(readonly consumer: Consumer) {}
}
