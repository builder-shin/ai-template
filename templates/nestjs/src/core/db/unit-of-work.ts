import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "./prisma.service.js";
export type Tx = Prisma.TransactionClient;
export type AfterCommit = (hook: () => Promise<void> | void) => void;
export interface UnitOfWorkOptions {
  readonly isolationLevel?: Prisma.TransactionIsolationLevel;
  readonly timeout?: number;
  readonly maxWait?: number;
}
@Injectable()
export class UnitOfWork {
  private readonly logger = new Logger(UnitOfWork.name);
  constructor(private readonly prisma: PrismaService) {}
  async run<T>(
    fn: (tx: Tx, afterCommit: AfterCommit) => Promise<T>,
    options?: UnitOfWorkOptions,
  ): Promise<T> {
    const hooks: (() => Promise<void> | void)[] = [];
    const result = await this.prisma.$transaction(
      (tx) =>
        fn(tx, (hook) => {
          hooks.push(hook);
        }),
      options,
    );
    for (const hook of hooks) {
      try {
        await hook();
      } catch (error) {
        this.logger.error("After-commit hook failed.", error);
      }
    }
    return result;
  }
}
