import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";
import { UnitOfWork } from "./unit-of-work.js";
@Global()
@Module({ providers: [PrismaService, UnitOfWork], exports: [PrismaService, UnitOfWork] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class DbModule {}
