import { Module } from "@nestjs/common";
import { RolesModule } from "../roles/index.js";
import { UsersRepository } from "./repository.js";
import "./schemas.js";
@Module({ imports: [RolesModule], providers: [UsersRepository], exports: [UsersRepository] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class UsersModule {}
